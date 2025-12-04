'use client'
import { useState, useRef } from 'react'
import { supabase } from '@/utils/supabase'

interface GameButtonProps {
  playerId: string
  roundNumber: number
  onSubmitted: () => void
}

export default function GameButton({ playerId, roundNumber, onSubmitted }: GameButtonProps) {
  const [isHolding, setIsHolding] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [statusText, setStatusText] = useState("Hold to Bid")
  
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
  const startPress = (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (isHolding) return

    setIsHolding(true)
    setStatusText("Charging...")
    startTimeRef.current = performance.now()
    
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const now = performance.now()
        setElapsedTime((now - startTimeRef.current) / 1000)
      }
    }, 50)
  }

  const endPress = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!isHolding || !startTimeRef.current) return

    const endTime = performance.now()
    if (timerRef.current) clearInterval(timerRef.current)
    
    const durationRaw = (endTime - startTimeRef.current) / 1000
    const durationFinal = Math.round(durationRaw * 100) / 100

    // [修正] 先不要急著設為 false，等資料庫確認成功再鎖定
    // setIsHolding(false) <-- 移到後面
    
    const isFold = durationFinal < 5.0
    
    // 傳送至 Supabase
    try {
      // [關鍵修正] 接收並檢查 error
      const { error } = await supabase.from('ta_bids').insert({
        player_id: playerId,
        round_number: roundNumber,
        bid_seconds: durationFinal,
        is_fold: isFold
      })

      if (error) {
        console.error("DB Error:", error)
        alert("出價失敗！請重試。\n錯誤訊息: " + error.message)
        setIsHolding(false) // 失敗了，重置按鈕讓玩家能再按一次
        setStatusText("Try Again")
        return
      }
      
      // 成功才執行以下動作
      setIsHolding(false)
      setStatusText(isFold ? `Folded (${durationFinal}s)` : `Submitted: ${durationFinal}s`)
      onSubmitted() 

    } catch (err: any) {
      console.error("System Error", err)
      alert("系統錯誤: " + err.message)
      setIsHolding(false)
    }
  }

  const getButtonColor = () => {
    if (!isHolding) return 'bg-blue-600'
    if (elapsedTime < 5.0) return 'bg-green-500'
    return 'bg-red-600'
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-96 select-none">
      <div className="mb-4 text-4xl font-mono font-bold text-gray-800">
        {isHolding ? elapsedTime.toFixed(1) + 's' : '0.0s'}
      </div>
      
      <button
        className={`
          w-64 h-64 rounded-full text-white text-2xl font-bold shadow-2xl transition-all duration-100
          ${getButtonColor()}
          ${isHolding ? 'scale-95 ring-4 ring-offset-4 ring-gray-400' : 'scale-100'}
        `}
        onMouseDown={startPress}
        onMouseUp={endPress}
        onMouseLeave={endPress}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        style={{ touchAction: 'none' }}
      >
        {isHolding 
          ? (elapsedTime < 5 ? "RELEASE TO FOLD" : "COMMITTED!") 
          : "HOLD TO START"
        }
      </button>

      <p className="mt-6 text-gray-500">{statusText}</p>
    </div>
  )
}
