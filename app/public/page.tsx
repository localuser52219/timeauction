'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/utils/supabase'

export default function PublicPage() {
  const [gameState, setGameState] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [bids, setBids] = useState<any[]>([])

  const gameStateRef = useRef<any>(null)

  useEffect(() => {
    fetchData()

    const channel = supabase.channel('public_view')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ta_rooms' }, (payload: any) => {
         const newRoom = payload.new
         setGameState(newRoom)
         gameStateRef.current = newRoom 

         if (newRoom.game_status === 'revealed') {
            setTimeout(() => fetchBids(newRoom.current_round), 500)
         } else if (newRoom.game_status === 'bidding') {
            setBids([]) 
         }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_players' }, fetchPlayers)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const fetchData = async () => {
    const { data: room } = await supabase.from('ta_rooms').select('*').single()
    if (room) {
      setGameState(room)
      gameStateRef.current = room
      if(room.game_status === 'revealed') fetchBids(room.current_round)
    }
    fetchPlayers()
  }

  const fetchPlayers = async () => {
    const { data } = await supabase.from('ta_players').select('*').order('tokens', { ascending: false }).order('total_time_left', { ascending: true })
    setPlayers(data || [])
  }

  const fetchBids = async (round: number) => {
    const { data } = await supabase.from('ta_bids').select('*').eq('round_number', round)
    setBids(data || [])
  }

  const getBidDisplay = (playerId: string) => {
    if (!gameState) return '-'
    const bid = bids.find(b => b.player_id === playerId)
    
    if (gameState.game_status === 'bidding') {
       return <span className="text-gray-500 animate-pulse text-sm font-mono tracking-widest">THINKING...</span>
    }
    
    if (bid) {
       if (bid.is_fold) return <span className="text-gray-500 text-sm font-bold">FOLD</span>
       return <span className="text-blue-400 text-3xl font-bold font-mono">{bid.bid_seconds.toFixed(2)}s</span>
    }
    return <span className="text-red-900 text-sm">NO BID</span>
  }

  const getWinnerId = () => {
     if(gameState?.game_status !== 'revealed' || bids.length === 0) return null
     const validBids = bids.filter(b => !b.is_fold)
     if(validBids.length === 0) return null
     const max = Math.max(...validBids.map(b => b.bid_seconds))
     const winners = validBids.filter(b => b.bid_seconds === max)
     return winners.length === 1 ? winners[0].player_id : null
  }
  
  const winnerId = getWinnerId()

  const getResultOverlayInfo = () => {
      if (gameState?.game_status !== 'revealed' || bids.length === 0) return null
      
      const validBids = bids.filter(b => !b.is_fold)
      
      if (validBids.length === 0) {
          return { type: 'none', title: 'NO WINNER', subtitle: 'All players folded' }
      }

      const max = Math.max(...validBids.map(b => b.bid_seconds))
      const winners = validBids.filter(b => b.bid_seconds === max)
      
      if (winners.length > 1) {
          return { type: 'tie', title: 'DRAW', subtitle: `Multiple players bid ${max.toFixed(2)}s` }
      }

      const winnerPlayer = players.find(p => p.id === winners[0].player_id)
      return { 
          type: 'winner', 
          title: winnerPlayer?.name || 'Unknown', 
          bid: max.toFixed(2),
          subtitle: 'WINNER'
      }
  }

  const resultInfo = getResultOverlayInfo()

  if (!gameState) return <div className="p-10 text-xl text-white">Connecting System...</div>

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-8 overflow-hidden font-sans selection:bg-blue-500 selection:text-white relative">
      
      {/* 頂部資訊列 */}
      <div className="flex justify-between items-end mb-10 border-b border-white/10 pb-6 relative z-10">
        <div>
           <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-400 to-gray-600 italic">
             TIME AUCTION
           </h1>
           <div className="text-gray-500 text-xs tracking-[0.3em] mt-2 uppercase">Survival Game Protocol</div>
        </div>
        <div className="text-right">
           <div className="text-blue-500 text-xs uppercase tracking-[0.2em] mb-1 font-bold">Current Round</div>
           <div className="text-7xl font-mono font-bold text-white leading-none">
             {gameState.current_round}
             <span className="text-3xl text-gray-700 ml-2 font-light">/ {gameState.settings_total_rounds || 19}</span>
           </div>
        </div>
      </div>

      {/* 狀態指示燈 */}
      <div className="flex justify-center mb-12 relative z-10">
         <div className={`relative px-12 py-4 rounded-full border transition-all duration-500
            ${gameState.game_status === 'bidding' 
              ? 'bg-blue-900/20 border-blue-500/50 shadow-[0_0_40px_rgba(59,130,246,0.2)]' 
              : (gameState.game_status === 'ended' ? 'bg-purple-900/40 border-purple-500 shadow-[0_0_50px_rgba(168,85,247,0.5)]' : 'bg-red-900/20 border-red-500/50 shadow-[0_0_40px_rgba(239,68,68,0.2)]')}`}>
            <span className={`text-3xl font-bold tracking-[0.25em] uppercase
              ${gameState.game_status === 'bidding' ? 'text-blue-400 animate-pulse' : (gameState.game_status === 'ended' ? 'text-purple-300' : 'text-red-500')}`}>
              {gameState.game_status === 'bidding' ? 'BIDDING OPEN' : (gameState.game_status === 'ended' ? 'GAME FINISHED' : 'RESULTS REVEALED')}
            </span>
         </div>
      </div>

      {/* 玩家卡片網格 (背景用) */}
      <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 relative z-10 transition-opacity duration-1000 ${gameState.game_status === 'ended' ? 'opacity-20 blur-sm' : 'opacity-100'}`}>
        {players.map(p => {
          const isWinner = p.id === winnerId
          return (
            <div key={p.id} 
                 className={`relative bg-neutral-900 rounded-2xl p-6 border transition-all duration-500 group
                 ${isWinner 
                    ? 'border-yellow-500/80 shadow-[0_0_50px_rgba(234,179,8,0.3)] scale-105 z-10' 
                    : 'border-white/5 hover:border-white/10 hover:bg-neutral-800'
                 }
                 `}>
              {isWinner && <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-yellow-500 text-black font-bold px-4 py-1 rounded-full text-xs">ROUND WINNER</div>}
              <div className="flex justify-between items-start mb-6">
                 <h2 className="text-xl font-bold truncate text-gray-200">{p.name}</h2>
                 <div className="flex items-center gap-1 bg-yellow-500/10 px-2 py-1 rounded-lg border border-yellow-500/20">
                   <span className="text-yellow-500 font-bold text-lg">{p.tokens}</span>
                   <span className="text-[10px] text-yellow-600 uppercase">WIN</span>
                 </div>
              </div>
              <div className="bg-black/40 rounded-xl p-5 text-center border border-white/5 relative overflow-hidden">
                 <div className="text-[9px] text-gray-600 uppercase mb-2">Bid Submitted</div>
                 <div className="relative z-10">{getBidDisplay(p.id)}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* [Overlay 1] 單局結算特效 */}
      {gameState.game_status === 'revealed' && resultInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in zoom-in duration-300">
             <div className="relative flex flex-col items-center justify-center p-16 border-4 border-yellow-500 bg-neutral-900 rounded-[3rem] shadow-[0_0_150px_rgba(234,179,8,0.4)] max-w-4xl w-full mx-4 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-yellow-500/10 via-transparent to-blue-500/10 pointer-events-none"></div>
                <div className="text-yellow-600 font-bold tracking-[0.5em] text-xl uppercase mb-8 relative z-10">Round {gameState.current_round} Result</div>
                {resultInfo.type === 'winner' && (
                  <div className="text-center relative z-10 animate-in slide-in-from-bottom-10 duration-500">
                     <div className="text-2xl text-yellow-200 mb-2 font-bold tracking-widest">WINNER</div>
                     <div className="text-8xl md:text-9xl font-black text-white mb-8 tracking-tighter drop-shadow-[0_10px_10px_rgba(0,0,0,0.8)] leading-none text-nowrap">{resultInfo.title}</div>
                     <div className="inline-flex items-center gap-4 px-10 py-4 bg-yellow-500/10 rounded-full border border-yellow-500/30">
                       <span className="text-gray-400 text-sm uppercase tracking-widest">Winning Bid</span>
                       <span className="text-5xl font-mono font-bold text-yellow-400">{resultInfo.bid}s</span>
                     </div>
                  </div>
                )}
                {resultInfo.type === 'tie' && <div className="text-9xl font-black text-gray-300 mb-4 tracking-widest">DRAW</div>}
                {resultInfo.type === 'none' && <div className="text-8xl font-black text-red-600 mb-4 tracking-widest">NO WINNER</div>}
             </div>
          </div>
      )}

      {/* [Overlay 2] 最終總結算排行榜 (Grand Leaderboard) */}
      {gameState.game_status === 'ended' && (
          <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl animate-in fade-in duration-1000">
             <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-100 to-yellow-500 uppercase tracking-tighter mb-12 drop-shadow-[0_0_30px_rgba(234,179,8,0.6)]">
                Final Leaderboard
             </h1>
             
             <div className="w-full max-w-5xl px-8">
                 <div className="grid grid-cols-1 gap-4">
                     {/* 表頭 */}
                     <div className="grid grid-cols-12 gap-4 px-6 py-2 text-gray-500 text-sm font-bold uppercase tracking-widest border-b border-white/10">
                        <div className="col-span-1">Rank</div>
                        <div className="col-span-5">Player</div>
                        <div className="col-span-3 text-right">Tokens</div>
                        <div className="col-span-3 text-right">Time Left</div>
                     </div>

                     {/* 列表 */}
                     {players.map((p, index) => (
                         <div key={p.id} className={`grid grid-cols-12 gap-4 items-center px-8 py-5 rounded-2xl border transition-all duration-500 
                             ${index === 0 
                                ? 'bg-gradient-to-r from-yellow-900/40 to-yellow-600/10 border-yellow-500/50 scale-105 shadow-[0_0_40px_rgba(234,179,8,0.2)] z-10' 
                                : 'bg-neutral-900/60 border-white/5 hover:bg-neutral-800'
                             }`}>
                             
                             {/* 名次 */}
                             <div className="col-span-1 text-2xl font-black text-gray-400">
                                {index === 0 ? '👑' : `#${index + 1}`}
                             </div>
                             
                             {/* 玩家名 */}
                             <div className={`col-span-5 text-2xl font-bold truncate ${index === 0 ? 'text-yellow-200' : 'text-gray-200'}`}>
                                {p.name}
                             </div>
                             
                             {/* 分數 (Tokens) */}
                             <div className="col-span-3 text-right">
                                <span className={`text-4xl font-mono font-bold ${index === 0 ? 'text-yellow-400' : 'text-white'}`}>
                                    {p.tokens}
                                </span>
                                <span className="text-sm text-yellow-600 ml-2">★</span>
                             </div>

                             {/* 剩餘時間 */}
                             <div className="col-span-3 text-right font-mono text-gray-400">
                                {p.total_time_left.toFixed(2)}s
                             </div>
                         </div>
                     ))}
                 </div>
             </div>
          </div>
      )}
    </div>
  )
}
