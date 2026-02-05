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
    setExpandedNote,

    // validation
    sanitizeContent,
    validateContent,
    MAX_CONTENT_LENGTH,

    // icons (passed from App.jsx)
    X,
    Maximize,
}) {
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

            <div className="flex items-center gap-2 mb-2">
                <input
                    type="number"
                    value={note.shares || ''}
                    onChange={(e) => updateNoteShares(note.id, e.target.value)}
                    placeholder="# shares"
                    className="w-24 bg-white bg-opacity-50 border border-gray-400 rounded px-2 py-1 text-sm text-gray-700 placeholder-gray-400"
                />
                {note.shares > 0 && <span className="text-xs text-gray-600">shares owned</span>}
            </div>

            <textarea
                value={note.text}
                onChange={(e) => {
                    const newText = sanitizeContent(e.target.value);
                    if (!validateContent(newText)) {
                        alert(`Note content cannot exceed ${MAX_CONTENT_LENGTH} characters.`);
                        return;
                    }
                    setNotes(notes.map(n => n.id === note.id ? { ...n, text: newText } : n));
                }}
                placeholder="Notes..."
                className="w-full h-full bg-transparent border-none outline-none resize-none text-gray-800 placeholder-gray-500"
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
        </div>
    );
}
