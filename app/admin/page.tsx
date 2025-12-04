'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

export default function AdminPage() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // 遊戲資料 State
  const [players, setPlayers] = useState<any[]>([])
  const [bids, setBids] = useState<any[]>([])
  const [gameState, setGameState] = useState<any>(null)

  useEffect(() => {
    // 檢查是否已登入
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) initDashboard()
    })
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) alert(error.message)
    else {
      setSession(data.session)
      initDashboard()
    }
    setLoading(false)
  }

  // --- Dashboard 邏輯 (與之前類似，但加上了即時監聽) ---
  const initDashboard = () => {
    fetchData()
    subscribeRealtime()
  }

  const subscribeRealtime = () => {
    supabase.channel('admin_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_players' }, fetchPlayers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_bids' }, fetchBids)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_rooms' }, (payload) => setGameState(payload.new))
      .subscribe()
  }

  const fetchData = async () => {
    fetchPlayers()
    fetchBids()
    const { data } = await supabase.from('ta_rooms').select('*').single()
    if (data) setGameState(data)
  }

  const fetchPlayers = async () => {
    const { data } = await supabase.from('ta_players').select('*').order('tokens', { ascending: false }).order('total_time_left', { ascending: true })
    setPlayers(data || [])
  }
  
  const fetchBids = async () => {
    // Admin 權限可以讀取所有 bids (因為 Step 3 的 RLS 設定)
    if(!gameState) return
    const { data } = await supabase.from('ta_bids').select('*')
    // 這裡我們只取當前局或上一局的數據，視需求過濾
    setBids(data || [])
  }

  // --- 遊戲控制 ---
  const nextRound = async () => {
    if (!gameState) return
    // 清空當前出價顯示 (UI層面)
    setBids([]) 
    await supabase.from('ta_rooms').update({
      current_round: gameState.current_round + 1,
      game_status: 'bidding'
    }).eq('id', gameState.id)
  }

  const settleRound = async () => {
    if (!gameState) return
    // 1. 獲取當前局的所有出價
    const { data: currentBids } = await supabase.from('ta_bids').select('*').eq('round_number', gameState.current_round)
    if (!currentBids || currentBids.length === 0) {
      await supabase.from('ta_rooms').update({ game_status: 'revealed' }).eq('id', gameState.id)
      return
    }

    // 2. 計算邏輯
    const validBids = currentBids.filter(b => !b.is_fold)
    let winnerId = null
    
    if (validBids.length > 0) {
      const maxTime = Math.max(...validBids.map(b => b.bid_seconds))
      const winners = validBids.filter(b => b.bid_seconds === maxTime)
      if (winners.length === 1) winnerId = winners[0].player_id
    }

    // 3. 執行更新 (扣時 + 加分)
    // 注意：這裡簡單處理，實際生產建議用 Database Function 確保原子性
    for (let bid of currentBids) {
        // 即使 Fold (放棄) 的人，如果是因為手滑超過 5 秒但也按了 fold，這裡邏輯上是不扣分的
        // 但根據你的規則：按住超過5秒就是有效出價，要扣分。
        // 所以這裡我們只扣除 validBids 和 "雖然沒贏但也按了很久" 的人
        // 簡單起見：只要 bid_seconds > 0 就扣 (由前端判定 fold)
        if (bid.bid_seconds > 0) {
             const p = players.find(x => x.id === bid.player_id)
             if (p) {
                 await supabase.from('ta_players').update({ 
                     total_time_left: p.total_time_left - bid.bid_seconds 
                 }).eq('id', p.id)
             }
        }
    }

    if (winnerId) {
        const w = players.find(x => x.id === winnerId)
        if(w) await supabase.from('ta_players').update({ tokens: w.tokens + 1 }).eq('id', winnerId)
    }

    await supabase.from('ta_rooms').update({ game_status: 'revealed' }).eq('id', gameState.id)
  }
  
  const resetGame = async () => {
      if(!confirm("DANGER: Reset Game?")) return
      // 重置所有數據
      await supabase.from('ta_bids').delete().neq('bid_seconds', -1) // Delete all
      await supabase.from('ta_players').update({ total_time_left: 600, tokens: 0, is_eliminated: false }).neq('tokens', -1)
      await supabase.from('ta_rooms').update({ current_round: 1, game_status: 'waiting' }).eq('id', gameState.id)
      alert("Game Reset!")
  }

  // --- Render ---

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <form onSubmit={handleLogin} className="p-8 bg-white rounded shadow-md w-96">
          <h2 className="text-2xl mb-4 font-bold">Admin Login</h2>
          <input className="w-full p-2 border mb-4" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="w-full p-2 border mb-4" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
          <button disabled={loading} className="w-full bg-black text-white p-2 rounded">{loading ? 'Loading...' : 'Login'}</button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">🕹️ Game Control</h1>
        <div className="space-x-4">
             <button onClick={resetGame} className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 text-sm">Reset All</button>
             <button onClick={() => supabase.auth.signOut().then(()=>setSession(null))} className="px-4 py-2 text-red-500 underline">Logout</button>
        </div>
      </div>

      {gameState && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
           {/* 控制面板 */}
           <div className="md:col-span-1 bg-white p-6 rounded-xl shadow border-2 border-blue-100">
              <div className="text-sm text-gray-500 uppercase">Current Status</div>
              <div className="text-4xl font-bold mb-4">{gameState.game_status}</div>
              <div className="text-xl mb-6">Round: <span className="font-mono font-bold text-blue-600">{gameState.current_round}</span> / 19</div>
              
              <div className="flex flex-col gap-3">
                 <button onClick={nextRound} disabled={gameState.game_status === 'bidding'} className="p-4 bg-blue-600 text-white rounded font-bold hover:bg-blue-700 disabled:opacity-50">
                    1. Start Round
                 </button>
                 <button onClick={settleRound} disabled={gameState.game_status === 'revealed'} className="p-4 bg-red-600 text-white rounded font-bold hover:bg-red-700 disabled:opacity-50">
                    2. Settle & Reveal
                 </button>
              </div>
           </div>

           {/* 監控面板 */}
           <div className="md:col-span-2 bg-white rounded-xl shadow overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-4">Player</th>
                    <th className="p-4">Time Left</th>
                    <th className="p-4">Tokens</th>
                    <th className="p-4 bg-yellow-50">Current Bid ({gameState.current_round})</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {players.map(p => {
                    const bid = bids.find(b => b.player_id === p.id && b.round_number === gameState.current_round)
                    return (
                      <tr key={p.id}>
                        <td className="p-4 font-medium">{p.name}</td>
                        <td className="p-4 font-mono">{p.total_time_left.toFixed(2)}s</td>
                        <td className="p-4">
                           {[...Array(p.tokens)].map((_,i)=><span key={i}>★</span>)}
                        </td>
                        <td className="p-4 bg-yellow-50 font-mono">
                           {bid ? (
                               bid.is_fold ? <span className="text-gray-400 text-sm">FOLD ({bid.bid_seconds}s)</span> : <span className="text-blue-600 font-bold">{bid.bid_seconds}s</span>
                           ) : <span className="text-gray-300">-</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
           </div>
        </div>
      )}
    </div>
  )
}
