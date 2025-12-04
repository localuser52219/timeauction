'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

export default function PublicPage() {
  const [gameState, setGameState] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [bids, setBids] = useState<any[]>([])

  useEffect(() => {
    fetchData()
    const channel = supabase.channel('public_view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_rooms' }, (payload: any) => {
         setGameState(payload.new)
         if (payload.new && payload.new.current_round) {
            fetchBids(payload.new.current_round) 
         }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_players' }, fetchPlayers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_bids' }, () => {
         if(gameState) fetchBids(gameState.current_round)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchData = async () => {
    const { data: room } = await supabase.from('ta_rooms').select('*').single()
    if (room) {
      setGameState(room)
      fetchBids(room.current_round)
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
       return <span className="text-gray-400 animate-pulse text-sm">thinking...</span>
    }
    
    if (bid) {
       if (bid.is_fold) return <span className="text-gray-400 text-sm">FOLD</span>
       return <span className="text-blue-500 text-3xl font-bold font-mono">{bid.bid_seconds.toFixed(2)}s</span>
    }
    return <span className="text-red-300 text-sm">NO BID</span>
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

  if (!gameState) return <div className="p-10 text-xl text-white">Loading Arena...</div>

  return (
    <div className="min-h-screen bg-neutral-900 text-white p-8 overflow-hidden font-sans">
      <div className="flex justify-between items-end mb-10 border-b border-gray-700 pb-4">
        <div>
           <h1 className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-red-600 uppercase italic">
             Time Auction
           </h1>
        </div>
        <div className="text-right">
           <div className="text-gray-400 text-sm uppercase tracking-widest">Current Round</div>
           <div className="text-6xl font-mono font-bold text-gray-200">{gameState.current_round} <span className="text-2xl text-gray-600">/ 19</span></div>
        </div>
      </div>

      <div className="text-center mb-8">
         <span className={`inline-block px-10 py-3 rounded-full text-2xl font-bold tracking-[0.2em] uppercase shadow-lg
            ${gameState.game_status === 'bidding' ? 'bg-green-600/20 text-green-400 border border-green-500/50 animate-pulse' : 'bg-red-600 text-white'}`}>
            {gameState.game_status}
         </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {players.map(p => {
          const isWinner = p.id === winnerId
          return (
            <div key={p.id} 
                 className={`relative bg-gray-800 rounded-xl p-6 border-2 transition-all duration-500
                 ${isWinner ? 'border-yellow-400 scale-105 shadow-[0_0_30px_rgba(250,204,21,0.5)] z-10 bg-gray-800' : 'border-gray-700/50 opacity-90'}
                 `}>
              {isWinner && <div className="absolute -top-4 -right-4 text-4xl animate-bounce">👑</div>}
              
              <div className="flex justify-between items-start mb-4">
                 <h2 className="text-2xl font-bold truncate max-w-[70%]">{p.name}</h2>
                 <div className="text-yellow-400 font-bold text-xl flex">
                   {p.tokens}<span className="text-xs mt-1 ml-1 text-yellow-600">★</span>
                 </div>
              </div>

              <div className="bg-gray-900/50 rounded-lg p-4 text-center mb-2 border border-white/5">
                 <div className="text-[10px] text-gray-500 uppercase mb-1 tracking-wider">Bid Time</div>
                 <div>{getBidDisplay(p.id)}</div>
              </div>

              {/* [修改功能] 剩餘時間已被隱藏 (Commented Out) */}
              <div className="text-center mt-2 opacity-20">
                 <span className="text-[10px] uppercase tracking-widest">HIDDEN</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
