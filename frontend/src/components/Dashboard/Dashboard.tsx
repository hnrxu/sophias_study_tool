import { useEffect, useState } from 'react';
import { supabase } from '../../sbClient';
import styles from "./index.module.css";
import Flashcards from '../Flashcards';
import { Trash2 } from "lucide-react";
import { Eye } from "lucide-react";
import { Pen } from "lucide-react"
import Audios from '../Audios';
import { AnimatePresence, motion } from "framer-motion";

const modes = ['chat', 'flashcards', 'audio notes']

const Dashboard = ({session}) => {

    const [systems, setSystems] = useState<any[]>([]);
    const [systemName, setSystemName] = useState("");
    const [selectedSystem, setSelectedSystem] = useState<any>(undefined)
    const [query, setQuery] = useState("");
    const [userQuery, setUserQuery] = useState("");
    const [selectedFiles, setSelectedFiles] = useState<any[]>([]);
    const [response, setResponse] = useState("");
    const [sources, setSources] = useState<{url: string, path: string, fileName: string}[]>([])
    const [mode, setMode] = useState('chat');
    const [prevMode, setPrevMode] = useState('chat');
    const [systemFiles, setSystemFiles] = useState<{url: string, path: string, fileName: string, isDirectFile: boolean}[]>([]);
    const [decks, setDecks] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [showSystemSettings, setShowSystemSettings] = useState(false);
    const [renamingSystem, setRenamingSystem] = useState<any[]>(null)
    const [renameValue, setRenameValue] = useState("")
    const [fileViewerIndex, setFileViewerIndex] = useState<number | null>(null)
    const [showUploadModal, setShowUploadModal] = useState(false)
    const [showPdfPanel, setShowPdfPanel] = useState(false);
    const [openFolder, setOpenFolder] = useState<string | null>(null)
    const [audioFiles, setAudioFiles] = useState<any[]>([])
    const [asmrFiles, setAsmrFiles] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(false);



    const getDirection = (current: string, previous: string) => {
        return modes.indexOf(current) > modes.indexOf(previous) ? 1 : -1
    }

    const switchMode = (m: string) => {
        setPrevMode(mode)
        setMode(m)
    }

    const getSystems = async() => {
        const response = await supabase
            .from('systems')
            .select("*")
            .eq('user_id', session.user.id)
        setSystems(response.data);

        if (!selectedSystem && response.data?.length > 0) {
            const first = response.data[0]
            setSelectedSystem(first)
            getSystemFiles(first.id)
            getAudioFiles(first.id)
            getDecks(first.id)
        } else if (response.data?.length === 0) {
            setSelectedSystem(null)  // no systems, show empty state
        }
    }

    useEffect(() => {
        if (session) getSystems(); 
    }, [session])

    const handleLogout = async() => {
        await supabase.auth.signOut();
    }

    const handleCreateSystem = async(name: string) => {
        const response = await supabase
                                .from('systems')
                                .insert({user_id: session.user.id, name})
        if (!response.error) getSystems();
    }

    const handleDeleteSystem = async(systemId) => {
        const response = await supabase
                                .from('systems')
                                .delete()
                                .eq('id', systemId)
        if (response.error) console.log(response.error);
        getSystems();
        setShowSystemSettings(null);

        const { data: files } = await supabase.storage
            .from('files')
            .list(`${session.user.id}/${systemId}`)
        
        if (files && files.length > 0) {
            const allPages = []
            for (const file of files) {
                const { data: pages } = await supabase.storage
                .from('files')
                .list(`${session.user.id}/${systemId}/${file.name}`)
                if (pages) pages.forEach(page => allPages.push(`${session.user.id}/${systemId}/${file.name}/${page.name}`))
            }
            if (allPages.length > 0) await supabase.storage.from('files').remove(allPages)
        }
    }

    const handleRenameSystem = async(systemId) => {
        await supabase
            .from('systems')
            .update({ name: renameValue })
            .eq('id', systemId)
        getSystems();
        setRenamingSystem(null);
    }

    const handleUpload = async(files, systemId) => {
        const formData = new FormData();
        for (const file of files) formData.append('files', file);
        formData.append('systemId', systemId);
        formData.append('userId', session.user.id);

        const response = await fetch('https://sophiasstudytool-production.up.railway.app/upload', {
            method: 'POST',
            body: formData
        })
        const message = await response.text();
        console.log('upload response:', message);
        await getSystemFiles(systemId);
    }

    const handleSearch = async (systemId) => {
        if (!query.trim() || !systemId || isLoading) return
        setIsLoading(true)
        setResponse('')
        setUserQuery(query)
        setQuery('')
      
        setPrevMode(mode)
        setMode('chat')

        try {
            const response = await fetch('https://sophiasstudytool-production.up.railway.app/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ systemId: systemId, query: query, userId: session.user.id })
            })

            const contentType = response.headers.get('Content-Type')

            if (contentType?.includes('text/plain')) {
                setResponse('')
                const reader = response.body.getReader()
                const decoder = new TextDecoder()
                let fullText = ''

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break
                    fullText += decoder.decode(value)
                    const lastNewline = fullText.lastIndexOf('\n')
                    const lastLine = fullText.substring(lastNewline).trim()
                    const displayText = lastLine.startsWith('[') 
                        ? fullText.substring(0, lastNewline).trim()
                        : fullText
                    setResponse(displayText)
                }

                const lastNewline = fullText.lastIndexOf('\n')
                const sourcesLine = fullText.substring(lastNewline).trim()
                
                try {
                    const paths = JSON.parse(sourcesLine)
                    const answerText = fullText.substring(0, lastNewline).trim()
                    setResponse(answerText)
                    const sourceObjects = await Promise.all(paths.map(async (path) => {
                        const { data } = await supabase.storage
                            .from('files')
                            .createSignedUrl(path, 3600)
                        const fileName = path.split('/')[2]
                        return { url: data.signedUrl, path, fileName }
                    }))
                    setSources(sourceObjects)
                    setShowPdfPanel(true)
                } catch {
                    // no sources
                }
                return
            }

            const responsejson = await response.json()

            if (!response.ok) {
                setResponse(responsejson.error.message)
                return
            }

            const content = responsejson.answer;
            setResponse(content);

            if (responsejson.type === 'flashcard') {
                await getDecks(selectedSystem.id);
                switchMode('flashcards');
                return;
            }
            if (responsejson.type === 'deck_deleted') {
                await getDecks(selectedSystem.id);
                return;
            }
            if (responsejson.type === 'audio_notes') {
                await getAudioFiles(selectedSystem.id);
                switchMode('audio notes');
                return;
            }

            const sourceObjects = await Promise.all((responsejson.sources || []).map(async (path) => {
                const { data } = await supabase.storage
                    .from('files')
                    .createSignedUrl(path, 3600);
                const fileName = path.split('/')[2]
                return { url: data.signedUrl, path, fileName }
            }))
            setSources(sourceObjects);
            if (sourceObjects.length > 0) setShowPdfPanel(true);

        } finally {
            setIsLoading(false)
        }
    }

    const getSystemFiles = async (systemId: string) => {
        const { data } = await supabase.storage
            .from('files')
            .list(`${session.user.id}/${systemId}`)
        
        if (data) {
            const results = await Promise.all(data.map(async (item) => {
                const { data: pages } = await supabase.storage
                    .from('files')
                    .list(`${session.user.id}/${systemId}/${item.name}`)
                
                if (!pages || pages.length === 0) {
                    const path = `${session.user.id}/${systemId}/${item.name}`
                    const { data: urlData } = await supabase.storage
                        .from('files')
                        .createSignedUrl(path, 3600)
                    return [{ url: urlData?.signedUrl, path, fileName: item.name, isDirectFile: true }]
                }

                return Promise.all(pages.map(async (page) => {
                    const path = `${session.user.id}/${systemId}/${item.name}/${page.name}`
                    const { data: urlData } = await supabase.storage
                        .from('files')
                        .createSignedUrl(path, 3600)
                    return { url: urlData?.signedUrl, path, fileName: item.name, isDirectFile: false }
                }))
            }))
            setSystemFiles(results.flat().filter(Boolean))
        }
    }

    const getAudioFiles = async (systemId: string) => {
        const [{ data: normal }, { data: asmr }] = await Promise.all([
            supabase.storage.from('audio').list(`${session.user.id}/${systemId}/normal`),
            supabase.storage.from('audio').list(`${session.user.id}/${systemId}/asmr`)
        ])

        const toFileObjects = async (files: any[], folder: string) => {
            if (!files || files.length === 0) return []
            return Promise.all(files.map(async (file) => {
                const path = `${session.user.id}/${systemId}/${folder}/${file.name}`
                const { data: urlData } = await supabase.storage.from('audio').createSignedUrl(path, 3600)
                return {
                    url: urlData?.signedUrl,
                    path,
                    fileName: file.name.replace(/_/g, ' ').replace('.mp3', '')
                }
            }))
        }

        const [normalFiles, asmrFiles] = await Promise.all([
            toFileObjects(normal, 'normal'),
            toFileObjects(asmr, 'asmr')
        ])

        setAudioFiles(normalFiles)
        setAsmrFiles(asmrFiles)
    }

    const getDecks = async(systemId) => {
        const response = await supabase
                                .from('decks')
                                .select('*, flashcards(*)')
                                .eq('user_id', session.user.id)
                                .eq('system_id', systemId)
        if (response.data) setDecks(response.data);
    }

    const handleDeleteAudioFile = async (file: {path: string}, systemId: string) => {
        await supabase.storage.from('audio').remove([file.path])
        await getAudioFiles(systemId)
    }

    const handleDeleteFile = async (file: {path: string, fileName: string}, systemId: string) => {
        const { error: storageError } = await supabase.storage.from('files').remove([file.path])
        console.log('storage error:', storageError)
        const { error: chunksError } = await supabase
            .from('chunks')
            .delete()
            .eq('user_id', session.user.id)
            .eq('system_id', systemId)
            .eq('file_name', file.path)
        console.log('chunks error:', chunksError)
        setSources([])
        await getSystemFiles(systemId)
    }

    useEffect(() => {
        if (!showSystemSettings) return;
        const handle = (e) => { setShowSystemSettings(null); setRenamingSystem(null); }
        document.addEventListener('click', handle);
        return () => document.removeEventListener('click', handle);
    }, [showSystemSettings]);







    return <div className={styles.app}>
    <div className={styles.sidebar}>
        <span className={styles.sidebarTitle}>Systems</span>
        <button className={styles.createBtn} onClick={() => {setShowModal(true)}}>+ create system</button>
        <div className={styles.systemItems}>
            {systems.length === 0 && (
                <div className={styles.noSystems}>no systems yet</div>
            )}
            {systems.map((system, index) => (
                <div key={index}
                    className={`${styles.systemItem} ${selectedSystem?.id === system.id ? styles.systemItemActive : ''}`}
                    onClick={() => { setSelectedSystem(system); getSystemFiles(system.id); getAudioFiles(system.id); getDecks(system.id); setOpenFolder(null); setSources([]); setUserQuery(""); setResponse("")}}>
                    <span className={styles.systemName}>
                        {renamingSystem === system.id 
                            ? <input 
                                autoFocus
                                value={renameValue}
                                onChange={e => setRenameValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') { handleRenameSystem(system.id); setRenameValue('') } }}
                                onClick={e => e.stopPropagation()}
                                className={styles.renameInput}
                                placeholder={system.name}
                                size={1}
                                onBlur={() => { setRenamingSystem(null); setRenameValue('') }}
                            />
                            : system.name
                        }
                    </span>
                    <span className={styles.systemSettings} onClick={(e) => { e.stopPropagation(); setShowSystemSettings(prev => prev === system.id ? null : system.id); setRenamingSystem(null) }}>
                        ...
                        {showSystemSettings === system.id && (
                            <div className={styles.settingsDropdown} onClick={e => e.stopPropagation()}>
                                <div onClick={() => { setRenamingSystem(system.id); setShowSystemSettings(null) }} className={styles.systemOption}>
                                    <Pen className={styles.systemicon}/> rename
                                </div>
                                <hr style={{ 
                                    border: 'none', 
                                    borderTop: '1px solid var(--accent)', 
                                    margin: '4px 0',
                                    maskImage: 'linear-gradient(to right, transparent 0%, white 10%, white 90%, transparent 100%)',
                                    WebkitMaskImage: 'linear-gradient(to right, transparent 0%, white 10%, white 90%, transparent 100%)'
                                }} />
                                <div onClick={() => handleDeleteSystem(system.id)} className={styles.systemOption}>
                                    <Trash2 className={styles.systemicon}/> delete
                                </div>
                            </div>
                        )}
                    </span>
                </div>
            ))}
        </div>
    </div>

    {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <span className={styles.modalTitle}>create new system</span>
                <input className={styles.modalInput} value={systemName} onChange={e => setSystemName(e.target.value)} placeholder="system name" onKeyDown={e => { if (e.key === 'Enter') { handleCreateSystem(systemName); setShowModal(false) }}} />
                <div className={styles.modalButtons}>
                    <button className={styles.modalBtn1} onClick={() => setShowModal(false)}>cancel</button>
                    <button className={styles.modalBtn2} onClick={() => { handleCreateSystem(systemName); setShowModal(false); setShowPdfPanel(true) }}>create</button>  
                </div>
            </div>
        </div>
    )}

    <div className={styles.main}>
        <div className={styles.topBar}>
            <span className={styles.topBarTitle}>{selectedSystem?.name ?? ''}</span>
            <div className={styles.topBarActions}>
                {selectedSystem && (
                    <label className={styles.manageLabel} onClick={() => setShowPdfPanel(prev => !prev)}>
                        {showPdfPanel ? 'hide' : 'show'} files
                    </label>
                )}
                <button className={styles.logoutBtn} onClick={handleLogout}>logout</button>
            </div>
        </div>

        <div className={styles.modeBar}>
            {modes.map(m => (
                <button
                    key={m}
                    className={`${styles.modeBtn} ${mode === m ? styles.modeBtnActive : ''}`}
                    onClick={() => switchMode(m)}
                >
                    {m}
                </button>
            ))}
        </div>

        <div className={styles.chatArea}>

                {selectedSystem === undefined ? null : !selectedSystem ? (
                    <div className={styles.emptyState}>
                        <span className={styles.emptyText}>create a system to get started</span>
                    </div>
                ) : (
                <AnimatePresence mode="wait" custom={getDirection(mode, prevMode)}>
                    <motion.div
                        key={mode}
                        custom={getDirection(mode, prevMode)}
                        variants={{
                            initial: (dir: number) => ({ opacity: 0, x: dir * 60 }),
                            animate: { opacity: 1, x: 0 },
                            exit: (dir: number) => ({ opacity: 0, x: dir * -60 })
                        }}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        style={{ display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'visible', flex: 1 }}
                    >
                        {mode === 'chat' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
                                {!userQuery && !isLoading && selectedSystem && (
                                    <div className={styles.emptyState}>
                                        <span className={styles.emptyText}>ask a question to get started</span>
                                    </div>
                                )}
                                {userQuery && <div className={styles.msgUser}>{userQuery}</div>}
                                {isLoading && !response && <div className={styles.msgAssistant}>...</div>}
                                {response && <div className={styles.msgAssistant}>{response}</div>}
                            </div>
                        )}
                        {mode === 'flashcards' && (
                            <Flashcards
                                decks={decks}
                                session={session}
                                selectedSystem={selectedSystem}
                                onDecksChanged={() => getDecks(selectedSystem.id)}
                            />
                            )}
                        {mode === 'audio notes' && (
                            <Audios
                                audioFiles={audioFiles}
                                asmrFiles={asmrFiles}
                                onDelete={(file) => handleDeleteAudioFile(file, selectedSystem?.id)}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            )}
        </div>

        <div className={styles.inputRow}>
            <input
                className={styles.queryInput}
                type="text"
                placeholder={selectedSystem ? "ask anything about your files..." : "select or create a system to get started..."}
                value={query}
                disabled={!selectedSystem}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !isLoading && selectedSystem) handleSearch(selectedSystem?.id) }}
            />
            <button
                className={styles.sendBtn}
                disabled={isLoading || !selectedSystem}
                onClick={() => handleSearch(selectedSystem?.id)}
            >
                {isLoading ? '■' : '↑'}
            </button>
        </div>
    </div>

    <AnimatePresence>
        {showPdfPanel && 
            <motion.div
                className={styles.pdfPanel}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 400, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                style={{ overflow: 'hidden', minWidth: 0, flexShrink: 0 }}
            >
                <div className={styles.pdfPanelHeader}>
                    source files
                    <button className={styles.uploadLabel} onClick={() => setShowUploadModal(true)}>+ upload</button>
                </div>
                <div className={styles.pdfFrame}>
                    {sources.length > 0 ? (
                        <>
                            <div className={styles.folderBack} onClick={() => setSources([])}>← back</div>
                            {sources.map((source, index) => {
                                const ext = source.path.split('.').pop()?.toLowerCase();
                                const isAudio = ['mp3', 'wav', 'm4a', 'mpeg', 'mpga', 'webm'].includes(ext);
                                const isVideo = ['mp4'].includes(ext);
                                return (
                                    <div key={index} className={styles.iframeWrapper}>
                                        <div className={styles.iconWrapper}>
                                            <span onClick={() => setFileViewerIndex(index)} className={styles.iconText}>
                                                <Eye className={styles.icon} /> View
                                            </span>
                                        </div>
                                        {isAudio ? (
                                            <audio controls src={source.url} className={styles.audioPlayer} />
                                        ) : isVideo ? (
                                            <video controls src={source.url} className={styles.videoPlayer} />
                                        ) : (
                                            <>
                                                <div className={styles.iframeClickOverlay} onClick={() => setFileViewerIndex(index)} />
                                                <iframe className={styles.pdfIframe} src={`${source.url}#toolbar=0&navpanes=0&view=FitH`} />
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </>
                    ) : openFolder === null ? (
                        <div className={styles.folderWrapper}>
                            {[...new Set(systemFiles.map(f => f.fileName))].map((folderName, index) => (
                                <div key={index} className={styles.folderItem} onClick={() => setOpenFolder(folderName)}>
                                    <span>{folderName}</span>
                                    <span className={styles.folderCount}>
                                        {systemFiles.filter(f => f.fileName === folderName).length} pages
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : (() => {
                        const folderFiles = systemFiles.filter(f => f.fileName === openFolder)
                        return <>
                            <div className={styles.folderBack} onClick={() => setOpenFolder(null)}>← back</div>
                            {folderFiles.map((file, index) => (
                                <div key={index} className={styles.iframeWrapper}>
                                    <div className={styles.iconWrapper}>
                                        <span onClick={() => setFileViewerIndex(index)} className={styles.iconText}>
                                            <Eye className={styles.icon} /> View
                                        </span>
                                        <span onClick={() => handleDeleteFile(file, selectedSystem?.id)} className={styles.iconText}>
                                            <Trash2 className={styles.icon}/> Delete
                                        </span>
                                    </div>
                                    <div className={styles.iframeClickOverlay} onClick={() => setFileViewerIndex(index)} />
                                    <iframe className={styles.pdfIframe} src={`${file.url}#toolbar=0&navpanes=0&view=FitH`} />
                                </div>
                            ))}
                        </>
                    })()}
                </div>
            </motion.div>
        }
    </AnimatePresence>

    {fileViewerIndex !== null && (() => {
        const activeFiles = sources.length > 0 ? sources : systemFiles;
        const current = activeFiles[fileViewerIndex]
        return (
            <div className={styles.modalOverlay} onClick={() => setFileViewerIndex(null)}>
                <div className={styles.fileViewerModal} onClick={e => e.stopPropagation()}>
                    {current.fileName && <div className={styles.fileViewerName}>{current.fileName}</div>}
                    <button className={styles.fileViewerClose} onClick={() => setFileViewerIndex(null)}>✕</button>
                    <button
                        className={styles.fileViewerArrow}
                        style={{ left: 12 }}
                        onClick={() => setFileViewerIndex(i => Math.max(0, i - 1))}
                        disabled={fileViewerIndex === 0}
                    >‹</button>
                    <iframe
                        className={styles.fileViewerIframe}
                        src={`${current.url}#toolbar=0&navpanes=0&view=FitH`}
                    />
                    <button
                        className={styles.fileViewerArrow}
                        style={{ right: 12 }}
                        onClick={() => setFileViewerIndex(i => Math.min(activeFiles.length - 1, i + 1))}
                        disabled={fileViewerIndex === activeFiles.length - 1}
                    >›</button>
                </div>
            </div>
        )
    })()}

    {showUploadModal && (
        <div className={styles.modalOverlay} onClick={() => { setShowUploadModal(false); setSelectedFiles([]) }}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <span className={styles.modalTitle}>upload files</span>
                <div className={styles.modalWrapper}>
                    <label className={styles.uploadLabel}>
                        choose files
                        <input
                            type="file"
                            multiple
                            accept=".pdf,.mp3,.mp4,.m4a,.wav,.webm,.mpeg,.mpga"
                            style={{ display: 'none' }}
                            onChange={e => setSelectedFiles(prev => [...prev, ...Array.from(e.target.files)])}
                        />
                    </label>
                    {selectedFiles.length > 0 && 
                        <div className={styles.selectedFilesList}>
                            {selectedFiles.map((file, index) => (
                                <div key={index} className={styles.selectedFileItem}>
                                    <span>{file.name}</span>
                                    <span
                                        className={styles.selectedFileRemove}
                                        onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== index))}
                                    >✕</span>
                                </div>
                            ))}
                        </div>
                    }
                </div>
                <div className={styles.modalActions}>
                    <button className={styles.modalBtn1} onClick={() => { setShowUploadModal(false); setSelectedFiles([]) }}>cancel</button>
                    <button className={styles.modalBtn2} onClick={() => { handleUpload(selectedFiles, selectedSystem?.id); setShowUploadModal(false); setSelectedFiles([]) }}>upload</button>
                </div>
            </div>
        </div>
    )}
</div>
}

export default Dashboard;