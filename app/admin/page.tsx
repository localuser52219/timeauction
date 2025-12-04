'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/utils/supabase'

export default function AdminPage() {
  const [session, setSession] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // 遊戲資料
  const [players, setPlayers] = useState<any[]>([])
  const [bids, setBids] = useState<any[]>([])
  const [gameState, setGameState] = useState<any>(null)

  // 設定選項
  const [configTime, setConfigTime] = useState<number>(600)
  const [configRounds, setConfigRounds] = useState<number>(19)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) initDashboard()
    })
  }, [])

  // 同步 DB 設定到 UI
  useEffect(() => {
    if (gameState) {
      if (gameState.settings_initial_time) setConfigTime(gameState.settings_initial_time)
      if (gameState.settings_total_rounds) setConfigRounds(gameState.settings_total_rounds)
    }
  }, [gameState?.settings_initial_time, gameState?.settings_total_rounds])

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

  const initDashboard = () => {
    fetchData()
    subscribeRealtime()
  }

  const subscribeRealtime = () => {
    supabase.channel('admin_all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_players' }, fetchPlayers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_bids' }, fetchBids)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ta_rooms' }, (payload: any) => setGameState(payload.new))
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
    if(!gameState) return
    const { data } = await supabase.from('ta_bids').select('*')
    setBids(data || [])
  }

  const nextRound = async () => {
    if (!gameState) return
    if (gameState.current_round >= (gameState.settings_total_rounds || 19)) {
        alert("Game Over! Max rounds reached.")
        return
    }
    setBids([]) 
    await supabase.from('ta_rooms').update({
      current_round: gameState.current_round + 1,
      game_status: 'bidding'
    }).eq('id', gameState.id)
  }

  const settleRound = async () => {
    if (!gameState) return
    const { data: currentBids } = await supabase.from('ta_bids').select('*').eq('round_number', gameState.current_round)
    if (!currentBids || currentBids.length === 0) {
      await supabase.from('ta_rooms').update({ game_status: 'revealed' }).eq('id', gameState.id)
      return
    }
    // 手動結算僅更新狀態，主要依賴 DB Trigger
    await supabase.from('ta_rooms').update({ game_status: 'revealed' }).eq('id', gameState.id)
  }
  
  const resetGame = async () => {
      const confirmMsg = `⚠️ DANGER: FULL RESET? \n\n設定將變更為：\n時間: ${configTime}s\n回合: ${configRounds}\n\n這將【刪除所有玩家】，請確認沒有其他人在玩！`
      if(!confirm(confirmMsg)) return
      
      // 嘗試刪除所有玩家
      const { error } = await supabase.from('ta_players').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      
      if (error) {
        console.error("Delete Error:", error)
        alert("Reset Failed (Permission Error). 請檢查 SQL RLS Policy 是否允許 DELETE。\n錯誤訊息: " + error.message)
        return
      }

      await supabase.from('ta_rooms').update({ 
          current_round: 1, 
          game_status: 'waiting',
          settings_initial_time: configTime,
          settings_total_rounds: configRounds
      }).eq('id', gameState.id)
      
      alert("System Reset Successful. All players cleared.")
      fetchPlayers()
      setBids([])
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-200">
        <form onSubmit={handleLogin} className="p-8 bg-white rounded-xl shadow-xl w-96 border border-gray-300">
          <h2 className="text-3xl mb-6 font-bold text-black text-center">Admin Login</h2>
          <input className="w-full p-3 border border-gray-400 rounded mb-4 text-black text-lg" type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
          <input className="w-full p-3 border border-gray-400 rounded mb-6 text-black text-lg" type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} />
          <button disabled={loading} className="w-full bg-black text-white p-3 rounded font-bold hover:bg-gray-800 transition">{loading ? 'Loading...' : 'LOGIN'}</button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8 text-black">
      <div className="flex justify-between items-center mb-8 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <h1 className="text-4xl font-black tracking-tight text-black">🕹️ ADMIN CONTROL</h1>
        <button onClick={() => supabase.auth.signOut().then(()=>setSession(null))} className="px-6 py-2 bg-gray-200 hover:bg-gray-300 text-black font-bold rounded">Logout</button>
      </div>

      {/* 設定區塊 */}
      <div className="bg-white p-6 rounded-xl shadow-md border-2 border-purple-200 mb-8">
          <h3 className="text-xl font-bold mb-4 text-purple-800 flex items-center gap-2">
            ⚙️ Game Settings <span className="text-sm font-normal text-gray-600">(Applied on Reset)</span>
          </h3>
          <div className="flex flex-wrap gap-8 items-end">
              <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">Total Time</label>
                  <div className="flex gap-2">
                      {[60, 180, 600].map(t => (
                          <button key={t} onClick={() => setConfigTime(t)} className={`px-4 py-2 rounded font-bold border-2 ${configTime === t ? 'bg-purple-600 text-white border-purple-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400'}`}>{t}s</button>
                      ))}
                  </div>
              </div>
              <div>
                  <label className="block text-sm font-bold text-gray-700 mb-2 uppercase tracking-wider">Total Rounds</label>
                  <div className="flex gap-2">
                      {[3, 10, 19].map(r => (
                          <button key={r} onClick={() => setConfigRounds(r)} className={`px-4 py-2 rounded font-bold border-2 ${configRounds === r ? 'bg-purple-600 text-white border-purple-600' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-400'}`}>{r} R</button>
                      ))}
                  </div>
              </div>
              <button onClick={resetGame} className="px-6 py-3 bg-red-600 text-white rounded font-bold hover:bg-red-700 shadow-lg ml-auto border-2 border-red-800">
                 ⚠️ APPLY & FULL RESET
              </button>
          </div>
      </div>

      {gameState && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
           {/* 左側：控制台 */}
           <div className="md:col-span-1 bg-white p-6 rounded-xl shadow-md border-2 border-blue-200 h-fit">
              <div className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Status</div>
              <div className={`text-4xl font-black mb-4 uppercase ${gameState.game_status === 'bidding' ? 'text-green-600' : 'text-red-600'}`}>
                {gameState.game_status}
              </div>
              
              <div className="text-xl mb-6 font-bold text-gray-800 border-b pb-4">
                Round: <span className="text-blue-600 text-3xl mx-2">{gameState.current_round}</span> / {gameState.settings_total_rounds || 19}
              </div>

              <div className="flex flex-col gap-3">
                 <button onClick={nextRound} disabled={gameState.game_status === 'bidding'} 
                    className="p-4 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all">
                    ▶ START NEXT ROUND
                 </button>
                 <button onClick={settleRound} disabled={gameState.game_status === 'revealed'} 
                    className="p-4 bg-gray-800 text-white rounded-lg font-bold hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all text-sm">
                    ⚡ FORCE SETTLE (Emergency)
                 </button>
              </div>
              
              <div className="mt-6 p-4 bg-gray-100 rounded text-xs text-gray-600 leading-relaxed">
                <strong>Auto-Settle:</strong> System will automatically reveal results when <strong>ALL</strong> players have submitted their bids.
              </div>
           </div>

           {/* 右側：玩家監控 */}
           <div className="md:col-span-2 bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
              <div className="p-4 bg-gray-100 border-b border-gray-200 flex justify-between items-center">
                  <span className="font-bold text-lg text-black">PLAYERS ({players.length})</span>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-bold text-sm">
                    Bids Received: {bids.filter(b => b.round_number === gameState.current_round).length} / {players.length}
                  </span>
              </div>
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="p-4 text-gray-600 font-bold uppercase text-xs tracking-wider">Name</th>
                    <th className="p-4 text-gray-600 font-bold uppercase text-xs tracking-wider">Time Left</th>
                    <th className="p-4 text-gray-600 font-bold uppercase text-xs tracking-wider">Tokens</th>
                    <th className="p-4 bg-yellow-50 text-yellow-800 font-bold uppercase text-xs tracking-wider">Current Bid Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {players.map(p => {
                    const bid = bids.find(b => b.player_id === p.id && b.round_number === gameState.current_round)
                    
                    // [優化] 狀態顯示邏輯
                    let statusBadge;
                    if (bid) {
                        if (bid.is_fold) {
                            statusBadge = <span className="inline-block px-3 py-1 bg-red-100 text-red-800 rounded font-bold text-sm">🛑 FOLD ({bid.bid_seconds}s)</span>
                        } else {
                            statusBadge = <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded font-bold text-sm">✅ BID: {bid.bid_seconds}s</span>
                        }
                    } else {
                        statusBadge = <span className="inline-block px-3 py-1 bg-gray-100 text-gray-400 rounded font-medium text-sm animate-pulse">⏳ WAITING...</span>
                    }

                    return (
                      <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                        <td className="p-4 font-bold text-gray-900">{p.name}</td>
                        <td className="p-4 font-mono font-bold text-blue-600 text-lg">{p.total_time_left.toFixed(2)}s</td>
                        <td className="p-4 text-yellow-600 font-bold">
                           {p.tokens} ★
                        </td>
                        <td className="p-4 bg-yellow-50/50">
                           {statusBadge}
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
