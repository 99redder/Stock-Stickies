export default function NoteCard({
    note,
    darkMode,

    // ranking badge (optional)
    positionRankById,
    totalPositions,
    positionDetailsById,

    // category + label data
    categories,
    colorLabels,

    // state + handlers
    notes,
    setNotes,
    deleteNote,
    updateNoteTitle,
    updateNoteShares,
    updateNoteAccount,
    accounts,
    accountIds,
    isUnlocked,
    toggleNoteLock,
    sharesPrivacyMode,
    setExpandedNote,
    showBrandedNotice,

    // validation
    sanitizeContent,
    validateContent,
    MAX_CONTENT_LENGTH,

    // icons (passed from App.jsx)
    X,
    Maximize,
    Lock,
    Unlock,
}) {
    const accountLabel = accounts.find(a => a.id === note.account)?.label;
    const sharesValue = Number(note.shares) || 0;
    return (
        <div className={`${note.color} p-6 rounded-lg shadow-lg relative hover:scale-105 transition-transform`} style={{ minHeight: '200px' }}>
            {positionRankById?.[note.id] && (
                <div className="absolute top-1 left-1 group">
                    <div
                        className={`bg-white bg-opacity-70 border rounded px-1.5 py-0.5 text-[10px] leading-none font-bold ${darkMode ? 'text-gray-800 border-gray-300' : 'text-gray-700 border-gray-300'}`}
                    >
                        {positionRankById[note.id]} of {totalPositions}
                    </div>
                    <div
                        className={`absolute left-0 top-8 z-40 hidden group-hover:block w-60 rounded-lg border shadow-xl p-3 text-xs ${darkMode ? 'bg-gray-900 text-gray-200 border-gray-700' : 'bg-white text-gray-800 border-gray-200'}`}
                    >
                        <div className="font-bold mb-1">Position ranking</div>
                        <div className={`${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            <div>
                                <span className="font-semibold">Size:</span>{' '}
                                ${positionDetailsById[note.id].value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            <div>
                                <span className="font-semibold">% of total:</span>{' '}
                                {positionDetailsById[note.id].pctOfTotal.toFixed(1)}%
                            </div>
                            <div className="mt-2">
                                This is your <span className="font-semibold">
                                    {positionDetailsById[note.id].rank}
                                    {(positionDetailsById[note.id].rank % 10 === 1 && positionDetailsById[note.id].rank % 100 !== 11)
                                        ? 'st'
                                        : (positionDetailsById[note.id].rank % 10 === 2 && positionDetailsById[note.id].rank % 100 !== 12)
                                            ? 'nd'
                                            : (positionDetailsById[note.id].rank % 10 === 3 && positionDetailsById[note.id].rank % 100 !== 13)
                                                ? 'rd'
                                                : 'th'}
                                </span>
                                {' '}largest position out of <span className="font-semibold">{positionDetailsById[note.id].totalPositions}</span>.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="absolute top-2 right-2 flex gap-2">
                <select
                    value={note.color}
                    onChange={(e) => setNotes(notes.map(n => n.id === note.id ? { ...n, color: e.target.value } : n))}
                    className="bg-white bg-opacity-70 border rounded px-2 py-1 text-xs"
                >
                    {categories.map(c => <option key={c} value={c}>{colorLabels[c]}</option>)}
                </select>
                <button onClick={() => deleteNote(note.id)} className="text-gray-600 hover:text-gray-800"><X size={18} /></button>
            </div>

            <input
                type="text"
                value={note.title || ''}
                onChange={(e) => updateNoteTitle(note.id, e.target.value)}
                placeholder="TICKER"
                className="w-full bg-transparent border-none outline-none text-gray-800 placeholder-gray-500 font-bold text-xl mb-1 uppercase"
                style={{ letterSpacing: '0.05em' }}
            />

            {/* Shares + account are locked by default — the lock toggle swaps the read-only
                readout for the edit controls, so a stray click can't alter a position. */}
            <div className="flex items-start gap-2 mb-2">
                <div className="flex-1 min-w-0">
                    {isUnlocked ? (
                        <>
                            <div className="flex items-center gap-2 mb-2">
                                <input
                                    type={sharesPrivacyMode === 'hide' ? 'text' : 'number'}
                                    value={sharesPrivacyMode === 'hide' ? '••••' : (note.shares || '')}
                                    onChange={(e) => {
                                        if (sharesPrivacyMode === 'hide') return;
                                        updateNoteShares(note.id, e.target.value);
                                    }}
                                    readOnly={sharesPrivacyMode === 'hide'}
                                    placeholder="# shares"
                                    className={`w-24 bg-white bg-opacity-50 border border-gray-400 rounded px-2 py-1 text-sm text-gray-700 placeholder-gray-400 ${sharesPrivacyMode === 'hide' ? 'tracking-[0.2em] text-center cursor-not-allowed' : ''}`}
                                />
                                {sharesPrivacyMode === 'hide'
                                    ? <span className="text-xs text-gray-600">shares hidden</span>
                                    : <span className="text-xs text-gray-600">shares owned</span>}
                            </div>
                            <select
                                value={accountIds.includes(note.account) ? note.account : ''}
                                onChange={(e) => updateNoteAccount(note.id, e.target.value)}
                                className="bg-white bg-opacity-50 border border-gray-400 rounded px-2 py-1 text-xs text-gray-700"
                                title="Brokerage account for this position"
                            >
                                <option value="" disabled>Select account</option>
                                {accounts.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                            </select>
                        </>
                    ) : (
                        <>
                            {sharesPrivacyMode === 'hide' ? (
                                <div className="text-2xl font-bold text-gray-700 tracking-[0.2em] leading-none">••••</div>
                            ) : sharesValue > 0 ? (
                                <div className="flex items-baseline gap-1.5 leading-none">
                                    <span className="text-2xl font-bold text-gray-800 tabular-nums tracking-tight">
                                        {sharesValue.toLocaleString()}
                                    </span>
                                    <span className="text-xs font-medium uppercase tracking-wider text-gray-700">
                                        {sharesValue === 1 ? 'share' : 'shares'}
                                    </span>
                                </div>
                            ) : (
                                <div className="text-sm italic text-gray-700 leading-none py-1">No position</div>
                            )}
                            {accountLabel && (
                                <div className="mt-1.5">
                                    <span className="inline-block bg-white bg-opacity-60 border border-gray-400 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-800">
                                        {accountLabel}
                                    </span>
                                </div>
                            )}
                        </>
                    )}
                </div>
                <button
                    onClick={() => toggleNoteLock(note.id)}
                    className={`shrink-0 p-1 rounded ${isUnlocked ? 'text-gray-800 bg-white bg-opacity-60' : 'text-gray-700 hover:text-gray-900'}`}
                    title={isUnlocked ? 'Lock shares and account' : 'Unlock to edit shares and account'}
                    aria-label={isUnlocked ? 'Lock shares and account' : 'Unlock to edit shares and account'}
                    aria-pressed={!!isUnlocked}
                >
                    {isUnlocked ? <Unlock size={16}/> : <Lock size={16}/>}
                </button>
            </div>

            <textarea
                value={note.text}
                onChange={(e) => {
                    const newText = sanitizeContent(e.target.value);
                    if (!validateContent(newText)) {
                        showBrandedNotice(`Note content cannot exceed ${MAX_CONTENT_LENGTH} characters.`);
                        return;
                    }
                    setNotes(notes.map(n => n.id === note.id ? { ...n, text: newText } : n));
                }}
                placeholder="Notes..."
                className="w-full h-full bg-transparent border-none outline-none resize-none text-gray-800 placeholder-gray-700"
                style={{ minHeight: '100px' }}
                maxLength={MAX_CONTENT_LENGTH}
            />

            <button
                onClick={() => setExpandedNote(note)}
                className="absolute bottom-2 right-2 bg-white bg-opacity-70 hover:bg-opacity-100 p-2 rounded-lg shadow transition-all"
                title="View with chart"
            >
                <Maximize size={16} />
            </button>
            <span className={`absolute bottom-3 left-3 text-[11px] font-semibold px-2 py-1 rounded ${darkMode ? 'bg-gray-900/60 text-gray-200' : 'bg-white/60 text-gray-700'}`}>
                {colorLabels[note.color] || 'Category'}
            </span>
        </div>
    );
}
