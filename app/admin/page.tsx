'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

export default function AdminPage() {
  const [players, setPlayers] = useState<any[]>([])
  const [bids, setBids] = useState<any[]>([])
  const [gameState, setGameState] = useState<any>(null)

  // 1. 初始化監聽：即時更新玩家列表與出價情況
  useEffect(() => {
    fetchData()
    
    // 監聽玩家加入或狀態改變
    const playersSub = supabase.channel('players_monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_players' }, () => {
        fetchPlayers()
      })
      .subscribe()

    // 監聽出價 (即時看到誰已出手)
    const bidsSub = supabase.channel('bids_monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_bids' }, () => {
        fetchBids()
      })
      .subscribe()
      
    // 監聽房間狀態
    const roomSub = supabase.channel('room_monitor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_rooms' }, (payload) => {
        setGameState(payload.new)
      })
      .subscribe()

    return () => { supabase.removeAllChannels() }
  }, [])

  const fetchData = async () => {
    fetchPlayers()
    fetchBids()
    // 假設只有一個房間，取第一筆
    const { data } = await supabase.from('ta_rooms').select('*').single()
    if (data) setGameState(data)
  }

  const fetchPlayers = async () => {
    const { data } = await supabase.from('ta_players').select('*').order('tokens', { ascending: false })
    setPlayers(data || [])
  }
  
  const fetchBids = async () => {
    // 獲取當前回合的出價
    if(!gameState) return
    const { data } = await supabase.from('ta_bids').select('*').eq('round_number', gameState.current_round)
    setBids(data || [])
  }

  // --- 遊戲控制邏輯 ---

  // A. 開始新回合
  const nextRound = async () => {
    if (!gameState) return
    await supabase.from('ta_rooms').update({
      current_round: gameState.current_round + 1,
      game_status: 'bidding'
    }).eq('id', gameState.id)
    
    // 清空前端顯示的舊出價
    setBids([])
  }

  // B. 結算當前回合 (關鍵邏輯！)
  const settleRound = async () => {
    if (!gameState || !bids.length) return

    // 1. 找出有效出價 (大於5秒且沒放棄)
    const validBids = bids.filter(b => !b.is_fold)
    
    if (validBids.length === 0) {
      // 全員放棄，直接結束
      await supabase.from('ta_rooms').update({ game_status: 'revealed' }).eq('id', gameState.id)
      return
    }

    // 2. 找出最高價
    const maxTime = Math.max(...validBids.map(b => b.bid_seconds))
    
    // 3. 找出最高價者 (處理同分)
    const winners = validBids.filter(b => b.bid_seconds === maxTime)
    const isTie = winners.length > 1
    const winnerId = isTie ? null : winners[0].player_id

    // 4. 批量更新資料庫 (這部分建議未來移至 Supabase Edge Function 以保證原子性 Transaction)
    // 這裡演示前端連續調用
    
    // 4-1. 扣除所有「有效出價者」的時間 (輸贏都要扣)
    for (let bid of validBids) {
      const player = players.find(p => p.id === bid.player_id)
      if (player) {
        await supabase.from('ta_players').update({
          total_time_left: player.total_time_left - bid.bid_seconds
        }).eq('id', player.id)
      }
    }

    // 4-2. 如果有唯一贏家，加分
    if (winnerId) {
      const winner = players.find(p => p.id === winnerId)
      if (winner) {
        await supabase.from('ta_players').update({
          tokens: winner.tokens + 1
        }).eq('id', winnerId)
      }
    }

    // 5. 更新狀態為「已揭曉」
    await supabase.from('ta_rooms').update({ game_status: 'revealed' }).eq('id', gameState.id)
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      
      {gameState && (
        <div className="mb-6 p-4 bg-gray-100 rounded">
          <p>Status: <span className="font-bold">{gameState.game_status}</span></p>
          <p>Round: <span className="font-bold">{gameState.current_round} / 19</span></p>
          
          <div className="mt-4 flex gap-4">
            <button 
              onClick={nextRound}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Start Next Round
            </button>
            <button 
              onClick={settleRound}
              className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
            >
              Settle Round (結算)
            </button>
          </div>
        </div>
      )}

      {/* 玩家監控表 - 上帝視角 */}
      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-200">
            <th className="border p-2">Player</th>
            <th className="border p-2">Tokens</th>
            <th className="border p-2">Time Left</th>
            <th className="border p-2">Current Bid (Round {gameState?.current_round})</th>
          </tr>
        </thead>
        <tbody>
          {players.map(player => {
            const playerBid = bids.find(b => b.player_id === player.id)
            return (
              <tr key={player.id} className="text-center">
                <td className="border p-2">{player.name}</td>
                <td className="border p-2 font-bold text-green-600">{player.tokens}</td>
                <td className="border p-2">{player.total_time_left.toFixed(1)}s</td>
                <td className="border p-2">
                  {playerBid 
                    ? (playerBid.is_fold ? <span className="text-gray-400">Fold</span> : <span className="text-blue-600 font-mono">{playerBid.bid_seconds.toFixed(2)}s</span>)
                    : <span className="text-yellow-500 animate-pulse">Thinking...</span>
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
