'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'
import GameButton from '@/app/components/GameButton'

export default function PlayPage() {
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [gameState, setGameState] = useState<any>(null)
  const [myPlayerInfo, setMyPlayerInfo] = useState<any>(null)
  const [hasBidThisRound, setHasBidThisRound] = useState(false)

  // 1. 檢查本地是否有舊的 Session ID
  useEffect(() => {
    const localId = localStorage.getItem('ta_player_id')
    if (localId) fetchPlayerInfo(localId)
    
    // 訂閱房間狀態
    const roomSub = supabase.channel('room_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_rooms' }, (payload) => {
        setGameState(payload.new)
        // 新回合開始時，重置出價狀態
        if (payload.old.current_round !== payload.new.current_round) {
          setHasBidThisRound(false)
        }
      })
      .subscribe()
      
    // 訂閱自己的資料 (更新餘額)
    if (localId) {
        // ... (這裡可以加監聽 ta_players 更新自己的剩餘時間)
    }

    return () => { supabase.removeAllChannels() }
  }, [])

  const fetchPlayerInfo = async (id: string) => {
    const { data } = await supabase.from('ta_players').select('*').eq('id', id).single()
    if (data) {
      setPlayerId(data.id)
      setMyPlayerInfo(data)
    }
  }

  const handleJoin = async () => {
    if (!playerName) return
    const { data, error } = await supabase.from('ta_players').insert({ name: playerName }).select().single()
    if (data) {
      setPlayerId(data.id)
      setMyPlayerInfo(data)
      localStorage.setItem('ta_player_id', data.id)
    }
  }

  // --- Render ---

  if (!playerId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-4">
        <h1 className="text-3xl font-bold mb-8">Time Auction</h1>
        <input 
          type="text" 
          placeholder="Enter your name" 
          className="p-4 border rounded-lg mb-4 text-xl w-full max-w-xs"
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
        />
        <button onClick={handleJoin} className="bg-black text-white px-8 py-3 rounded-lg text-xl">Join Game</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* 頭部資訊欄 */}
      <div className="flex justify-between p-4 bg-gray-900 text-white">
        <div>
          <div className="text-xs text-gray-400">Player</div>
          <div className="font-bold text-lg">{myPlayerInfo?.name}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">Time Left</div>
          <div className="font-mono text-xl text-yellow-400">
            {myPlayerInfo?.total_time_left.toFixed(1)}s
          </div>
        </div>
      </div>

      {/* 遊戲主區 */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-gray-700">Round {gameState?.current_round || 1}</h2>
          <div className="text-sm text-gray-500 uppercase tracking-widest">{gameState?.game_status}</div>
        </div>

        {gameState?.game_status === 'bidding' && !hasBidThisRound ? (
          <GameButton 
            playerId={playerId} 
            roundNumber={gameState.current_round}
            onSubmitted={() => setHasBidThisRound(true)}
          />
        ) : gameState?.game_status === 'revealed' ? (
          <div className="text-center p-8 bg-gray-100 rounded-xl">
            <p className="text-xl">Round Ended.</p>
            <p className="text-gray-500">Wait for Admin...</p>
          </div>
        ) : (
          <div className="text-center p-8 animate-pulse">
            <p className="text-2xl font-bold text-blue-600">Waiting for next round...</p>
          </div>
        )}
      </div>
      
      {/* 底部 Tokens */}
      <div className="p-4 bg-gray-100 flex justify-center items-center gap-2">
         Tokens: 
         {[...Array(myPlayerInfo?.tokens || 0)].map((_, i) => (
           <span key={i} className="w-6 h-6 bg-yellow-500 rounded-full shadow-sm block"></span>
         ))}
      </div>
    </div>
  )
}
