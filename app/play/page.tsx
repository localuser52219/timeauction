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
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let roomChannel: any;
    let playerChannel: any;

    const initGame = async () => {
      const { data: authData, error } = await supabase.auth.signInAnonymously()
      
      if (error) {
        console.error('Auth failed:', error)
        alert('無法連接伺服器，請重新整理頁面')
        return
      }

      const uid = authData.session?.user?.id
      if (!uid) return

      setPlayerId(uid)

      // 檢查玩家資料
      const { data: existingPlayer } = await supabase
        .from('ta_players')
        .select('*')
        .eq('id', uid)
        .single()

      if (existingPlayer) {
        setMyPlayerInfo(existingPlayer)
        setPlayerName(existingPlayer.name)
        checkIfBid(uid)
      }

      // 檢查房間資料
      const { data: roomData } = await supabase.from('ta_rooms').select('*').single()
      if (roomData) {
        setGameState(roomData)
        if(existingPlayer) checkIfBid(uid, roomData.current_round)
      }

      setIsLoading(false)

      // Realtime 監聽
      roomChannel = supabase.channel('room_channel')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ta_rooms' }, (payload: any) => {
          setGameState(payload.new)
          if (payload.old?.current_round !== payload.new?.current_round) {
            setHasBidThisRound(false) // 新回合，重置出價狀態
          }
        })
        .subscribe()
      
      playerChannel = supabase.channel(`player_${uid}`)
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'ta_players', 
          filter: `id=eq.${uid}` 
        }, (payload: any) => {
          setMyPlayerInfo(payload.new)
        })
        .subscribe()
    }

    initGame()

    return () => {
      if (roomChannel) supabase.removeChannel(roomChannel)
      if (playerChannel) supabase.removeChannel(playerChannel)
    }
  }, [])

  const checkIfBid = async (uid: string, round?: number) => {
    const currentR = round || gameState?.current_round
    if(!currentR) return

    const { data } = await supabase
      .from('ta_bids')
      .select('id')
      .eq('player_id', uid)
      .eq('round_number', currentR)
      .single() 
    
    if (data) setHasBidThisRound(true)
  }

  const handleJoin = async () => {
    if (!playerName || !playerId) return
    
    // 讀取設定的時間
    const initialTime = gameState?.settings_initial_time || 600.0

    const { data, error } = await supabase.from('ta_players').upsert({ 
      id: playerId, 
      name: playerName,
      total_time_left: initialTime
    }).select().single()

    if (error) {
      alert('Join Failed: ' + error.message)
    } else {
      setMyPlayerInfo(data)
    }
  }

  // --- Render ---

  if (isLoading) return <div className="h-screen flex items-center justify-center">Connecting...</div>

  if (!myPlayerInfo) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-4">
        <h1 className="text-3xl font-bold mb-8 text-gray-800">Time Auction</h1>
        <input 
          type="text" placeholder="Nickname" 
          className="p-4 border rounded-lg mb-4 text-xl w-full max-w-xs text-black"
          value={playerName} onChange={e => setPlayerName(e.target.value)}
        />
        <button onClick={handleJoin} className="bg-black text-white px-8 py-3 rounded-lg text-xl">Join Game</button>
      </div>
    )
  }

  // [新增] 淘汰畫面
  if (myPlayerInfo.is_eliminated) {
    return (
      <div className="flex flex-col h-screen bg-red-900 text-white items-center justify-center p-8 text-center">
        <div className="text-6xl mb-4">☠️</div>
        <h1 className="text-4xl font-black uppercase mb-4">Eliminated</h1>
        <p className="text-xl opacity-80">You have run out of time.</p>
        <div className="mt-8 p-4 bg-black/30 rounded-xl">
          <p className="text-sm uppercase tracking-widest text-gray-400">Final Tokens</p>
          <p className="text-4xl font-bold text-yellow-500">{myPlayerInfo.tokens} ★</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* 頂部資訊 */}
      <div className="flex justify-between p-4 bg-gray-900 text-white shadow-md">
        <div>
          <div className="text-xs text-gray-400">Player</div>
          <div className="font-bold text-lg">{myPlayerInfo.name}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">Time Left</div>
          <div className={`font-mono text-xl font-bold ${myPlayerInfo.total_time_left < 30 ? 'text-red-500' : 'text-yellow-400'}`}>
            {myPlayerInfo.total_time_left.toFixed(1)}s
          </div>
        </div>
      </div>

      {/* 遊戲區 */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
        <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
           <span className="text-[200px] font-bold text-black">{gameState?.current_round}</span>
        </div>

        <div className="mb-8 text-center z-10">
          <h2 className="text-3xl font-bold text-gray-800">Round {gameState?.current_round || 1} / {gameState?.settings_total_rounds || 19}</h2>
          <div className={`text-sm font-bold uppercase tracking-widest px-3 py-1 rounded-full inline-block mt-2
            ${gameState?.game_status === 'bidding' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
            {gameState?.game_status === 'bidding' ? 'BIDDING OPEN' : gameState?.game_status}
          </div>
        </div>

        {gameState?.game_status === 'bidding' && !hasBidThisRound ? (
          <GameButton 
            playerId={playerId!} 
            roundNumber={gameState.current_round}
            maxDuration={myPlayerInfo.total_time_left} // [新增] 傳入剩餘時間上限
            onSubmitted={() => setHasBidThisRound(true)}
          />
        ) : gameState?.game_status === 'revealed' ? (
          <div className="text-center p-8 bg-gray-100 rounded-xl shadow-inner border border-gray-200">
            <p className="text-2xl font-bold text-gray-800">Round Ended</p>
            <p className="text-gray-500 mt-2">Check main screen.</p>
          </div>
        ) : hasBidThisRound ? (
          <div className="text-center p-8">
             <div className="text-6xl mb-4">🔒</div>
             <p className="text-xl font-bold text-gray-700">Bid Submitted</p>
             <p className="text-gray-500">Wait for others...</p>
          </div>
        ) : (
          <div className="text-center p-8 animate-pulse">
            <p className="text-xl font-bold text-blue-600">Waiting for game...</p>
          </div>
        )}
      </div>
      
      {/* 底部 Tokens */}
      <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-center gap-2">
         Tokens: {[...Array(myPlayerInfo.tokens || 0)].map((_, i) => <span key={i}>★</span>)}
      </div>
    </div>
  )
}
