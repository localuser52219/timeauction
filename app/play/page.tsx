'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'
import GameButton from '@/app/components/GameButton'

export default function PlayPage() {
  // 狀態管理
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [gameState, setGameState] = useState<any>(null)
  const [myPlayerInfo, setMyPlayerInfo] = useState<any>(null)
  const [hasBidThisRound, setHasBidThisRound] = useState(false)
  const [isLoading, setIsLoading] = useState(true) // [新增] 載入狀態，避免畫面閃爍

 // ... imports and state ...

  // [修改關鍵點 1] 初始化：執行匿名登入並設置監聽
  useEffect(() => {
    let roomChannel: any;
    let playerChannel: any;

    const initGame = async () => {
      // 1. 匿名登入
      const { data: authData, error } = await supabase.auth.signInAnonymously()
      
      if (error) {
        console.error('Auth failed:', error)
        return // 這裡簡單處理，實際可加 UI 提示
      }

      const uid = authData.session?.user?.id
      if (!uid) return

      setPlayerId(uid)

      // 2. 檢查資料庫是否已有此玩家資料
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

      // 3. 獲取當前房間狀態
      const { data: roomData } = await supabase.from('ta_rooms').select('*').single()
      if (roomData) {
        setGameState(roomData)
        if(existingPlayer) checkIfBid(uid, roomData.current_round)
      }

      setIsLoading(false)

      // 4. 設定即時監聽 (Realtime)
      
      // A. 監聽房間狀態 (換局)
      // [正確]
roomChannel = supabase.channel('room_channel')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ta_rooms' }, (payload: any) => {
    setGameState(payload.new)
    // 加上安全性檢查 (?.) 避免 payload.old 為空時報錯
    if (payload.old?.current_round !== payload.new?.current_round) {
      setHasBidThisRound(false)
    }
  })
  .subscribe()
      
      // B. 監聽「我自己」的資料
playerChannel = supabase.channel(`player_${uid}`)
  .on('postgres_changes', { 
    event: 'UPDATE', 
    schema: 'public', 
    table: 'ta_players', 
    filter: `id=eq.${uid}` 
  }, (payload: any) => { // [正確] 加上 : any
    setMyPlayerInfo(payload.new)
  })
  .subscribe()
    }

    initGame()

    return () => {
      if (roomChannel) supabase.removeChannel(roomChannel)
      if (playerChannel) supabase.removeChannel(playerChannel)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  
  // ... rest of the file ...

    initGame()

    // Cleanup: 離開頁面時取消訂閱
    return () => {
      if (roomChannel) supabase.removeChannel(roomChannel)
      if (playerChannel) supabase.removeChannel(playerChannel)
    }
  }, [])

  // 輔助函式：檢查本局是否已出過價
  const checkIfBid = async (uid: string, round?: number) => {
    // 如果沒傳 round，就用 state 裡的，再沒有就用 1
    const currentR = round || gameState?.current_round
    if(!currentR) return

    const { data } = await supabase
      .from('ta_bids')
      .select('id')
      .eq('player_id', uid)
      .eq('round_number', currentR)
      .single() // 如果有找到任何一筆，代表已出價
    
    if (data) setHasBidThisRound(true)
  }

  // [修改關鍵點 2] 加入遊戲
  const handleJoin = async () => {
    if (!playerName || !playerId) return
    
    // 這裡我們明確指定 id 為 auth.uid (playerId)
    // 這樣才能通過 RLS Policy: "auth.uid() = id"
    const { data, error } = await supabase.from('ta_players').upsert({ 
      id: playerId, 
      name: playerName 
    }).select().single()

    if (error) {
      console.error('Join failed:', error)
      alert('無法加入遊戲，請檢查網路')
    } else {
      setMyPlayerInfo(data)
    }
  }

  // --- Render 介面部分 ---

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <p className="text-xl text-gray-500 animate-pulse">Connecting...</p>
      </div>
    )
  }

  // 如果還沒加入 (資料庫無此人)，顯示登入畫面
  if (!myPlayerInfo) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-4">
        <h1 className="text-3xl font-bold mb-8 text-gray-800">Time Auction</h1>
        <input 
          type="text" 
          placeholder="Enter your nickname" 
          className="p-4 border rounded-lg mb-4 text-xl w-full max-w-xs text-black"
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
        />
        <button 
          onClick={handleJoin} 
          className="bg-black text-white px-8 py-3 rounded-lg text-xl hover:bg-gray-800 transition"
        >
          Join Game
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* 頂部狀態欄 */}
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

      {/* 主要遊戲區 */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 relative">
        {/* 背景大字 */}
        <div className="absolute inset-0 flex items-center justify-center opacity-5 pointer-events-none">
           <span className="text-[200px] font-bold text-black">{gameState?.current_round}</span>
        </div>

        <div className="mb-8 text-center z-10">
          <h2 className="text-3xl font-bold text-gray-800">Round {gameState?.current_round || 1} / 19</h2>
          <div className={`text-sm font-bold uppercase tracking-widest px-3 py-1 rounded-full inline-block mt-2
            ${gameState?.game_status === 'bidding' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
            {gameState?.game_status === 'bidding' ? 'BIDDING OPEN' : gameState?.game_status}
          </div>
        </div>

        {/* 核心邏輯：根據狀態顯示按鈕 */}
        {gameState?.game_status === 'bidding' && !hasBidThisRound ? (
          <GameButton 
            playerId={playerId!} // 這裡確定有 ID
            roundNumber={gameState.current_round}
            onSubmitted={() => setHasBidThisRound(true)}
          />
        ) : gameState?.game_status === 'revealed' ? (
          <div className="text-center p-8 bg-gray-100 rounded-xl shadow-inner border border-gray-200">
            <p className="text-2xl font-bold text-gray-800">Round Ended</p>
            <p className="text-gray-500 mt-2">Check the main screen for results.</p>
          </div>
        ) : hasBidThisRound ? (
          <div className="text-center p-8">
             <div className="text-6xl mb-4">🔒</div>
             <p className="text-xl font-bold text-gray-700">Bid Submitted</p>
             <p className="text-gray-500">Wait for other players...</p>
          </div>
        ) : (
          <div className="text-center p-8 animate-pulse">
            <p className="text-xl font-bold text-blue-600">Waiting for game to start...</p>
          </div>
        )}
      </div>
      
      {/* 底部 Tokens 顯示 */}
      <div className="p-4 bg-gray-50 border-t border-gray-200">
         <div className="flex justify-center items-center gap-2 flex-wrap">
           <span className="text-gray-500 font-bold mr-2 text-sm">TOKENS:</span>
           {myPlayerInfo.tokens === 0 && <span className="text-gray-300 text-sm">None yet</span>}
           {[...Array(myPlayerInfo.tokens || 0)].map((_, i) => (
             <span key={i} className="w-8 h-8 bg-yellow-400 border-2 border-yellow-600 rounded-full shadow-sm flex items-center justify-center text-xs font-bold text-yellow-900">
               ★
             </span>
           ))}
         </div>
      </div>
    </div>
  )
}
