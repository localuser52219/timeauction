'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

interface GameButtonProps {
  playerId: string
  roundNumber: number
  maxDuration: number
  onSubmitted: () => void
}

export default function GameButton({ playerId, roundNumber, maxDuration, onSubmitted }: GameButtonProps) {
  const [isHolding, setIsHolding] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false) // [新增] 鎖定狀態
  const [elapsedTime, setElapsedTime] = useState(0)
  const [statusText, setStatusText] = useState("Hold to Bid")
  
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  
  const startPress = (e: React.SyntheticEvent | Event) => {
    if (e && 'preventDefault' in e) e.preventDefault()
    
    // [修正] 如果正在送出中，禁止任何操作
    if (isHolding || isSubmitting) return
    
    if (maxDuration <= 0.1) {
      alert("You have no time left!")
      return
    }

    setIsHolding(true)
    setStatusText("Charging...")
    startTimeRef.current = performance.now()
    
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const now = performance.now()
        const currentSecs = (now - startTimeRef.current) / 1000
        
        if (currentSecs >= maxDuration) {
           forceSubmit(maxDuration)
        } else {
           setElapsedTime(currentSecs)
        }
      }
    }, 50)
  }

  const forceSubmit = (finalTime: number) => {
     if (timerRef.current) clearInterval(timerRef.current)
     setElapsedTime(finalTime)
     submitBid(finalTime)
  }

  const endPress = (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!isHolding || !startTimeRef.current || isSubmitting) return // [修正] 雙重檢查

    if (timerRef.current) clearInterval(timerRef.current)
    
    const endTime = performance.now()
    let durationRaw = (endTime - startTimeRef.current) / 1000
    
    if (durationRaw > maxDuration) durationRaw = maxDuration

    const durationFinal = Math.round(durationRaw * 100) / 100
    submitBid(durationFinal)
  }

  const submitBid = async (seconds: number) => {
    // 1. 馬上鎖定，防止連點
    setIsSubmitting(true)
    setIsHolding(false) 
    
    const isFold = seconds < 5.0
    setStatusText("Sending...") // 更新狀態文字

    try {
      const { error } = await supabase.from('ta_bids').insert({
        player_id: playerId,
        round_number: roundNumber,
        bid_seconds: seconds,
        is_fold: isFold
      })

      if (error) {
        // 如果是重複出價錯誤，我們就當作成功處理 (因為結果是一樣的：已出價)
        if (error.code === '23505') { // Postgres Unique Violation Code
            console.warn("Duplicate bid detected, ignoring.")
            onSubmitted()
            return
        }

        console.error("DB Error:", error)
        alert("Error: " + error.message)
        
        // 只有真的失敗才解鎖，讓玩家重試
        setIsSubmitting(false)
        setStatusText("Try Again")
        return
      }
      
      setStatusText(isFold ? `Folded (${seconds}s)` : `Submitted: ${seconds}s`)
      onSubmitted() 

    } catch (err: any) {
      console.error("System Error", err)
      alert("Error: " + err.message)
      setIsSubmitting(false)
    }
  }

  const getButtonColor = () => {
    if (isSubmitting) return 'bg-gray-400 cursor-not-allowed' // [新增] 送出中的顏色
    if (!isHolding) return 'bg-blue-600'
    if (elapsedTime < 5.0) return 'bg-green-500'
    if (elapsedTime > maxDuration - 5) return 'bg-red-800 animate-pulse'
    return 'bg-red-600'
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-96 select-none">
      <div className={`mb-4 text-4xl font-mono font-bold ${elapsedTime >= maxDuration ? 'text-red-600' : 'text-gray-800'}`}>
        {isHolding ? elapsedTime.toFixed(1) : (isSubmitting ? elapsedTime.toFixed(1) : '0.0')}s 
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
        disabled={isSubmitting} // [新增] 禁用屬性
        style={{ touchAction: 'none' }}
      >
        {isSubmitting 
          ? "SENDING..." 
          : (isHolding 
              ? (elapsedTime < 5 ? "RELEASE TO FOLD" : (elapsedTime >= maxDuration ? "MAX REACHED!" : "COMMITTED!"))
              : "HOLD TO START")
        }
      </button>

      <p className="mt-6 text-gray-500 animate-pulse">{statusText}</p>
    </div>
  )
}
