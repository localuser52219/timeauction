'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

interface GameButtonProps {
  playerId: string
  roundNumber: number
  onSubmitted: () => void // 通知父組件已提交
}

export default function GameButton({ playerId, roundNumber, onSubmitted }: GameButtonProps) {
  const [isHolding, setIsHolding] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0) // 僅用於 UI 顯示
  const [statusText, setStatusText] = useState("Hold to Bid")
  
  // 使用 useRef 紀錄精確時間，不依賴 React Render
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
  // 開始按壓
  const startPress = (e: React.SyntheticEvent) => {
    e.preventDefault() // 防止手機長按選取文字或跳出選單
    if (isHolding) return

    setIsHolding(true)
    setStatusText("Charging...")
    startTimeRef.current = performance.now()
    
    // 啟動 UI 計時器 (每100ms更新一次畫面，不影響最終精確度)
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const now = performance.now()
        setElapsedTime((now - startTimeRef.current) / 1000)
      }
    }, 50)
  }

  // 放開按鈕 (結算)
  const endPress = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!isHolding || !startTimeRef.current) return

    // 1. 停止計時
    const endTime = performance.now()
    if (timerRef.current) clearInterval(timerRef.current)
    
    // 2. 計算精確時間 (秒)
    const durationRaw = (endTime - startTimeRef.current) / 1000
    // 保留兩位小數
    const durationFinal = Math.round(durationRaw * 100) / 100

    setIsHolding(false)
    
    // 3. 判斷邏輯
    const isFold = durationFinal < 5.0
    
    setStatusText(isFold ? `Folded (${durationFinal}s)` : `Submitted: ${durationFinal}s`)

    // 4. 傳送至 Supabase
    try {
      await supabase.from('ta_bids').insert({
        player_id: playerId,
        round_number: roundNumber,
        bid_seconds: durationFinal,
        is_fold: isFold
      })
      
      onSubmitted() // 鎖定畫面或顯示等待中
    } catch (error) {
      console.error("Submission failed", error)
      alert("Network Error! Please try to tell Admin your time: " + durationFinal)
    }
  }

  // 根據時間改變按鈕顏色
  const getButtonColor = () => {
    if (!isHolding) return 'bg-blue-600'
    if (elapsedTime < 5.0) return 'bg-green-500' // 安全/放棄區
    return 'bg-red-600' // 危險/扣分區
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
        onMouseLeave={endPress} // 防止滑出按鈕邊界導致卡死
        onTouchStart={startPress}
        onTouchEnd={endPress}
        style={{ touchAction: 'none' }} // 關鍵 CSS：禁止瀏覽器默認手勢
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
