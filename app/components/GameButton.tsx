'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

interface GameButtonProps {
  playerId: string
  roundNumber: number
  maxDuration: number // [新增] 玩家剩餘時間上限
  onSubmitted: () => void
}

export default function GameButton({ playerId, roundNumber, maxDuration, onSubmitted }: GameButtonProps) {
  const [isHolding, setIsHolding] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [statusText, setStatusText] = useState("Hold to Bid")
  
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
  // 開始按壓
  const startPress = (e: React.SyntheticEvent | Event) => {
    // 支援 React Event 和 原生 Event (用於自動觸發)
    if (e && 'preventDefault' in e) e.preventDefault()
    
    if (isHolding) return
    
    // [新增] 檢查是否有剩餘時間
    if (maxDuration <= 0.1) {
      alert("You have no time left!")
      return
    }

    setIsHolding(true)
    setStatusText("Charging...")
    startTimeRef.current = performance.now()
    
    // 啟動計時器
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const now = performance.now()
        const currentSecs = (now - startTimeRef.current) / 1000
        
        // [新增] 強制截止邏輯
        if (currentSecs >= maxDuration) {
           forceSubmit(maxDuration) // 強制以最大時間送出
        } else {
           setElapsedTime(currentSecs)
        }
      }
    }, 50)
  }

  // 強制送出 (當時間用盡時)
  const forceSubmit = (finalTime: number) => {
     if (timerRef.current) clearInterval(timerRef.current)
     setElapsedTime(finalTime)
     submitBid(finalTime) // 直接呼叫送出邏輯
  }

  // 手動放開按鈕
  const endPress = (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!isHolding || !startTimeRef.current) return

    if (timerRef.current) clearInterval(timerRef.current)
    
    const endTime = performance.now()
    let durationRaw = (endTime - startTimeRef.current) / 1000
    
    // [新增] 雙重保險，確保不超過上限
    if (durationRaw > maxDuration) durationRaw = maxDuration

    const durationFinal = Math.round(durationRaw * 100) / 100
    submitBid(durationFinal)
  }

  // 核心送出邏輯 (抽離出來共用)
  const submitBid = async (seconds: number) => {
    setIsHolding(false)
    const isFold = seconds < 5.0
    
    try {
      const { error } = await supabase.from('ta_bids').insert({
        player_id: playerId,
        round_number: roundNumber,
        bid_seconds: seconds,
        is_fold: isFold
      })

      if (error) {
        console.error("DB Error:", error)
        alert("Error: " + error.message)
        setIsHolding(false)
        setStatusText("Try Again")
        return
      }
      
      setStatusText(isFold ? `Folded (${seconds}s)` : `Submitted: ${seconds}s`)
      onSubmitted() 

    } catch (err: any) {
      console.error("System Error", err)
      alert("Error: " + err.message)
      setIsHolding(false)
    }
  }

  const getButtonColor = () => {
    if (!isHolding) return 'bg-blue-600'
    if (elapsedTime < 5.0) return 'bg-green-500'
    // 當接近上限時變色警示
    if (elapsedTime > maxDuration - 5) return 'bg-red-800 animate-pulse'
    return 'bg-red-600'
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-96 select-none">
      <div className={`mb-4 text-4xl font-mono font-bold ${elapsedTime >= maxDuration ? 'text-red-600' : 'text-gray-800'}`}>
        {isHolding ? elapsedTime.toFixed(1) : '0.0'}s 
        <span className="text-sm text-gray-400 ml-2">/ {maxDuration.toFixed(1)}s</span>
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
          ? (elapsedTime < 5 ? "RELEASE TO FOLD" : (elapsedTime >= maxDuration ? "MAX REACHED!" : "COMMITTED!"))
          : "HOLD TO START"
        }
      </button>

      <p className="mt-6 text-gray-500">{statusText}</p>
    </div>
  )
}
