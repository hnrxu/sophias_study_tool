import { useState, useRef, useEffect, useCallback } from "react"
import styles from './index.module.css'
import { supabase } from "../../sbClient"
import { Pen } from "lucide-react"

type StudyMode = 'simple' | 'spaced' | 'default'

interface ModeState {
  queue: any[]
  currentIndex: number
  flipped: boolean
}

interface DeckMeta {
  mode: StudyMode
}

const DEFAULT_MODE: StudyMode = 'default'

const buildInitialQueue = (deck: any, mode: StudyMode): any[] => {
  if (mode === 'spaced') {
    const now = new Date()
    return deck.flashcards.filter((c: any) => new Date(c.due) <= now)
  }
  return [...deck.flashcards]
}

const Flashcards = ({ decks, session, selectedSystem, onDecksChanged }) => {
  const [selectedDeck, setSelectedDeck] = useState<any>(null)
  const [studyMode, setStudyMode] = useState<StudyMode>(DEFAULT_MODE)
  const [, setModeStateVersion] = useState(0)

  const [showNewDeckModal, setShowNewDeckModal] = useState(false)
  const [newDeckName, setNewDeckName] = useState("")

  const [showAddCardModal, setShowAddCardModal] = useState(false)
  const [newQuestion, setNewQuestion] = useState("")
  const [newAnswer, setNewAnswer] = useState("")

  const [showEditCardModal, setShowEditCardModal] = useState(false)
  const [editQuestion, setEditQuestion] = useState("")
  const [editAnswer, setEditAnswer] = useState("")

  const modeStateRef = useRef<Record<string, ModeState>>({})
  const deckMetaRef = useRef<Record<string, DeckMeta>>({})
  const carouselRef = useRef<HTMLDivElement>(null)
  const scrollEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isProgrammaticScrollRef = useRef(false)

  const modeKey = (deckId: string | number, mode: StudyMode) => `${deckId}__${mode}`

  const getModeState = useCallback((deckId: string | number, mode: StudyMode): ModeState => {
    return modeStateRef.current[modeKey(deckId, mode)]
  }, [])

  const setModeState = useCallback((deckId: string | number, mode: StudyMode, state: Partial<ModeState>) => {
    const key = modeKey(deckId, mode)
    modeStateRef.current[key] = { ...modeStateRef.current[key], ...state }
    setModeStateVersion(v => v + 1)
  }, [])

  const initModeStateIfNeeded = useCallback((deck: any, mode: StudyMode) => {
    const key = modeKey(deck.id, mode)
    if (!modeStateRef.current[key]) {
      modeStateRef.current[key] = {
        queue: buildInitialQueue(deck, mode),
        currentIndex: 0,
        flipped: false,
      }
    }
  }, [])

  const currentState: ModeState | null = selectedDeck
    ? getModeState(selectedDeck.id, studyMode) ?? null
    : null

  const queue = currentState?.queue ?? []
  const currentIndex = currentState?.currentIndex ?? 0
  const flipped = currentState?.flipped ?? false

  const clampIndex = (i: number) => Math.max(0, Math.min(i, queue.length - 1))

  const getCenteredIndex = () => {
    const track = carouselRef.current
    if (!track) return currentIndex
    const trackRect = track.getBoundingClientRect()
    const trackCenter = trackRect.left + trackRect.width / 2
    let closest = 0
    let minDist = Infinity
    Array.from(track.children).forEach((child, i) => {
      const el = child as HTMLElement
      const rect = el.getBoundingClientRect()
      const cardCenter = rect.left + rect.width / 2
      const dist = Math.abs(cardCenter - trackCenter)
      if (dist < minDist) { minDist = dist; closest = i }
    })
    return closest
  }

  const centerCard = (i: number, behavior: ScrollBehavior = "smooth") => {
    const track = carouselRef.current
    if (!track) return
    const card = track.children[i] as HTMLElement
    if (!card) return
    isProgrammaticScrollRef.current = true
    card.scrollIntoView({ behavior, block: "nearest", inline: "center" })
    window.setTimeout(() => { isProgrammaticScrollRef.current = false }, behavior === "smooth" ? 200 : 80)
  }

  const centerIndexAfterQueueChange = (index: number) => {
    requestAnimationFrame(() => { requestAnimationFrame(() => { centerCard(index, "instant") }) })
  }

  const scrollTo = (i: number) => {
    if (!selectedDeck || queue.length === 0) return
    const nextIndex = clampIndex(i)
    setModeState(selectedDeck.id, studyMode, { currentIndex: nextIndex, flipped: false })
    centerCard(nextIndex)
  }

  const moveBy = (direction: -1 | 1) => scrollTo(currentIndex + direction)

  const handleScroll = () => {
    if (!selectedDeck || isProgrammaticScrollRef.current) return
    if (scrollEndTimeoutRef.current) clearTimeout(scrollEndTimeoutRef.current)
    scrollEndTimeoutRef.current = setTimeout(() => {
      const closest = getCenteredIndex()
      if (closest !== currentIndex) {
        setModeState(selectedDeck.id, studyMode, { currentIndex: closest, flipped: false })
      }
    }, 80)
  }

  const setFlipped = (val: boolean | ((prev: boolean) => boolean)) => {
    if (!selectedDeck) return
    const next = typeof val === 'function' ? val(flipped) : val
    setModeState(selectedDeck.id, studyMode, { flipped: next })
  }

  const openDeck = (deck: any) => {
    const lastMode = deckMetaRef.current[deck.id]?.mode ?? DEFAULT_MODE
    ;(['default', 'simple', 'spaced'] as StudyMode[]).forEach(m => initModeStateIfNeeded(deck, m))
    setSelectedDeck(deck)
    setStudyMode(lastMode)
    setModeStateVersion(v => v + 1)
  }

  const closeDeck = () => setSelectedDeck(null)

  const switchMode = (mode: StudyMode) => {
    if (!selectedDeck) return
    initModeStateIfNeeded(selectedDeck, mode)
    deckMetaRef.current[selectedDeck.id] = { mode }
    setStudyMode(mode)
    setModeStateVersion(v => v + 1)
  }

  useEffect(() => {
    if (!selectedDeck) return
    const idx = modeStateRef.current[modeKey(selectedDeck.id, studyMode)]?.currentIndex ?? 0
    requestAnimationFrame(() => { centerCard(idx, "instant") })
  }, [selectedDeck, studyMode])

  useEffect(() => {
    return () => { if (scrollEndTimeoutRef.current) clearTimeout(scrollEndTimeoutRef.current) }
  }, [])

  const handleCreateDeck = async () => {
    if (!newDeckName.trim() || !session || !selectedSystem) return
    const { data, error } = await supabase
      .from('decks')
      .insert({ name: newDeckName.trim(), user_id: session.user.id, system_id: selectedSystem.id })
      .select()
      .single()
    if (!error && data) {
      await onDecksChanged()
      setShowNewDeckModal(false)
      setNewDeckName("")
    }
  }

  const handleAddCard = async () => {
    if (!newQuestion.trim() || !newAnswer.trim() || !selectedDeck) return
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('flashcards')
      .insert({
        deck_id: selectedDeck.id,
        question: newQuestion.trim(),
        answer: newAnswer.trim(),
        easiness: 2.5,
        interval: 1,
        due: now,
      })
      .select()
      .single()
    if (!error && data) {
      const updatedDeck = { ...selectedDeck, flashcards: [...selectedDeck.flashcards, data] }
      setSelectedDeck(updatedDeck)
      ;(['default', 'simple', 'spaced'] as StudyMode[]).forEach(m => {
        const key = modeKey(selectedDeck.id, m)
        delete modeStateRef.current[key]
        initModeStateIfNeeded(updatedDeck, m)
      })
      setModeStateVersion(v => v + 1)
      await onDecksChanged()
    }
    setShowAddCardModal(false)
    setNewQuestion("")
    setNewAnswer("")
  }

  const openEditModal = () => {
    const card = queue[currentIndex]
    setEditQuestion(card.question)
    setEditAnswer(card.answer)
    setShowEditCardModal(true)
  }

  const handleEditCard = async () => {
    if (!editQuestion.trim() || !editAnswer.trim() || !selectedDeck) return
    const card = queue[currentIndex]
    const { error } = await supabase
      .from('flashcards')
      .update({ question: editQuestion.trim(), answer: editAnswer.trim() })
      .eq('id', card.id)
    if (!error) {
      const updatedCard = { ...card, question: editQuestion.trim(), answer: editAnswer.trim() }
      const updatedDeck = {
        ...selectedDeck,
        flashcards: selectedDeck.flashcards.map((c: any) => c.id === card.id ? updatedCard : c)
      }
      setSelectedDeck(updatedDeck)
      ;(['default', 'simple', 'spaced'] as StudyMode[]).forEach(m => {
        const key = modeKey(selectedDeck.id, m)
        if (modeStateRef.current[key]) {
          modeStateRef.current[key].queue = modeStateRef.current[key].queue.map(
            (c: any) => c.id === card.id ? updatedCard : c
          )
        }
      })
      setModeStateVersion(v => v + 1)
      await onDecksChanged()
    }
    setShowEditCardModal(false)
  }

  const sm2 = (card: any, score: number) => {
    const easiness = Math.max(1.3, card.easiness + 0.1 - (5 - score) * 0.08)
    let interval
    if (score === 0) interval = 0
    else if (score === 2) interval = 1
    else if (score === 3) interval = Math.max(1, Math.round(card.interval * 1.2))
    else interval = Math.max(1, Math.round(card.interval * easiness))
    const due = new Date()
    due.setDate(due.getDate() + interval)
    return { easiness, interval, due: due.toISOString() }
  }

  const scores = [
    { score: 0, label: 'blackout', color: '#e74c3c' },
    { score: 2, label: 'hard', color: '#f1c40f' },
    { score: 3, label: 'ok', color: '#2ecc71' },
    { score: 5, label: 'perfect', color: '#1abc9c' },
  ]

  const buildSessionQueue = () => {
    if (!selectedDeck) return
    const fresh: ModeState = { queue: buildInitialQueue(selectedDeck, studyMode), currentIndex: 0, flipped: false }
    modeStateRef.current[modeKey(selectedDeck.id, studyMode)] = fresh
    setModeStateVersion(v => v + 1)
    requestAnimationFrame(() => { centerCard(0, "instant") })
  }

  const handleGotIt = () => {
    if (!selectedDeck) return
    const next = queue.filter((_, i) => i !== currentIndex)
    const nextIndex = Math.min(currentIndex, next.length - 1)
    setModeState(selectedDeck.id, studyMode, { queue: next, currentIndex: nextIndex, flipped: false })
    centerIndexAfterQueueChange(nextIndex)
  }

  const handleMissed = () => {
    if (!selectedDeck) return
    const removed = queue[currentIndex]
    const next = [...queue.filter((_, i) => i !== currentIndex), removed]
    const nextIndex = Math.min(currentIndex, next.length - 1)
    setModeState(selectedDeck.id, studyMode, { queue: next, currentIndex: nextIndex, flipped: false })
    centerIndexAfterQueueChange(nextIndex)
  }

  const learningSteps: Record<number, number | null> = { 0: 1, 2: 3, 3: 6, 5: null }

  const handleSpaced = async (score: number) => {
    if (!selectedDeck) return
    const card = queue[currentIndex]
    const updates = sm2(card, score)
    await supabase.from('flashcards').update(updates).eq('id', card.id)
    const updated = { ...card, ...updates }
    const rest = queue.filter((_, i) => i !== currentIndex)
    const step = learningSteps[score]
    let next: any[]
    if (step === null) {
      next = rest
    } else {
      const insertIndex = Math.min(currentIndex + step, rest.length)
      next = [...rest.slice(0, insertIndex), updated, ...rest.slice(insertIndex)]
    }
    const nextIndex = Math.min(currentIndex, next.length - 1)
    setModeState(selectedDeck.id, studyMode, { queue: next, currentIndex: nextIndex, flipped: false })
    centerIndexAfterQueueChange(nextIndex)
  }

  const ModeBar = () => (
    <div className={styles.modeBar}>
      {(['default', 'simple', 'spaced'] as StudyMode[]).map(m => (
        <button
          key={m}
          className={`${styles.modeBarBtn} ${studyMode === m ? styles.modeBarBtnActive : ''}`}
          onClick={() => switchMode(m)}
        >
          {m}
        </button>
      ))}
    </div>
  )

  if (selectedDeck) {
    const cards = queue

    const AddCardModal = (
      <div className={styles.modalOverlay} onClick={() => { setShowAddCardModal(false); setNewQuestion(""); setNewAnswer("") }}>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <span className={styles.modalTitle}>add card</span>
          <input autoFocus className={styles.modalInput} placeholder="question" value={newQuestion} onChange={e => setNewQuestion(e.target.value)} />
          <textarea className={styles.modalInput} placeholder="answer" value={newAnswer} onChange={e => setNewAnswer(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddCard() }} />
          <div className={styles.modalButtons}>
            <button className={styles.modalBtn1} onClick={() => { setShowAddCardModal(false); setNewQuestion(""); setNewAnswer("") }}>cancel</button>
            <button className={styles.modalBtn2} onClick={handleAddCard}>add</button>
          </div>
        </div>
      </div>
    )

    const EditCardModal = (
      <div className={styles.modalOverlay} onClick={() => setShowEditCardModal(false)}>
        <div className={styles.modal} onClick={e => e.stopPropagation()}>
          <span className={styles.modalTitle}>edit card</span>
          <input autoFocus className={styles.modalInput} placeholder="question" value={editQuestion} onChange={e => setEditQuestion(e.target.value)} />
          <textarea className={styles.modalInput} placeholder="answer" value={editAnswer} onChange={e => setEditAnswer(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleEditCard() }} />
          <div className={styles.modalButtons}>
            <button className={styles.modalBtn1} onClick={() => setShowEditCardModal(false)}>cancel</button>
            <button className={styles.modalBtn2} onClick={handleEditCard}>save</button>
          </div>
        </div>
      </div>
    )

    if ((studyMode === 'simple' || studyMode === 'spaced') && queue.length === 0) {
      return (
        <div className={styles.flashcardsPage}>
          {showAddCardModal && AddCardModal}
          {showEditCardModal && EditCardModal}
          <div className={styles.deckViewTopBar}>
            <button className={styles.backBtn} onClick={closeDeck}>← back to decks</button>
          </div>
          <div className={styles.headingWrapper}>
            <div className={styles.heading}>
              <p className={styles.deckTitle}>{selectedDeck.name}</p>
              <span className={styles.cardCounter}>0 / 0</span>
            </div>
            <ModeBar />
            <button className={styles.addLabel} onClick={() => setShowAddCardModal(true)}>+ add card</button>
          </div>
          <div className={styles.doneState}>
            <p className={styles.doneTitle}>deck complete!</p>
            <p className={styles.doneDesc}>you got through all the cards</p>
            <button className={styles.restartBtn} onClick={buildSessionQueue}>restart</button>
          </div>
        </div>
      )
    }

    return (
      <div className={styles.flashcardsPage}>
        {showAddCardModal && AddCardModal}
        {showEditCardModal && EditCardModal}
        <div className={styles.deckViewTopBar}>
          <button className={styles.backBtn} onClick={closeDeck}>← back to decks</button>
        </div>
        <div className={styles.headingWrapper}>
          <div className={styles.heading}>
            <p className={styles.deckTitle}>{selectedDeck.name}</p>
            <span className={styles.cardCounter}>{currentIndex + 1} / {cards.length}</span>
          </div>
          <ModeBar />
          <button className={styles.addLabel} onClick={() => setShowAddCardModal(true)}>+ add card</button>
        </div>
        <div className={styles.carouselWrapper}>
          <button className={styles.carouselArrow} onClick={() => moveBy(-1)} disabled={currentIndex === 0}>‹</button>
          <div className={styles.carouselTrack} ref={carouselRef} onScroll={handleScroll}>
            {cards.map((card, i) => (
              <div
                key={card.id ?? i}
                className={`${styles.carouselCard} ${i === currentIndex ? styles.carouselCardActive : ''}`}
                onClick={() => { if (i === currentIndex) setFlipped(f => !f); else scrollTo(i) }}
              >
                <p>{i === currentIndex && flipped ? card.answer : card.question}</p>
                {i === currentIndex && (
                  <>
                    <button
                      className={styles.editCardBtn}
                      onClick={e => { e.stopPropagation(); openEditModal() }}
                    >
                      edit <Pen size={10}/>
                    </button>
                    <span className={styles.flipHint}>{flipped ? 'answer' : 'question'} — click to flip</span>
                    
                  </>
                )}
              </div>
            ))}
          </div>
          <button className={styles.carouselArrow} onClick={() => moveBy(1)} disabled={currentIndex === cards.length - 1}>›</button>
        </div>
        <div className={styles.studyControls}>
          {studyMode === 'simple' && (
            <>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${((selectedDeck.flashcards.length - queue.length) / selectedDeck.flashcards.length) * 100}%` }} />
              </div>
              <div className={styles.answerBtns}>
                <button className={styles.missedBtn} onClick={handleMissed}>✕ missed it</button>
                <button className={styles.gotItBtn} onClick={handleGotIt}>✓ got it</button>
              </div>
            </>
          )}
          {studyMode === 'spaced' && (
            <div className={styles.answerBtns}>
              {scores.map(({ score, label, color }) => (
                <button key={score} className={styles.ratingBtn} style={{ borderColor: color, color }} onClick={() => handleSpaced(score)}>
                  {score}<span>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.flashcardsPage}>
      {showNewDeckModal && (
        <div className={styles.modalOverlay} onClick={() => { setShowNewDeckModal(false); setNewDeckName("") }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <span className={styles.modalTitle}>create new deck</span>
            <input autoFocus className={styles.modalInput} placeholder="deck name" value={newDeckName} onChange={e => setNewDeckName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleCreateDeck() }} />
            <div className={styles.modalButtons}>
              <button className={styles.modalBtn1} onClick={() => { setShowNewDeckModal(false); setNewDeckName("") }}>cancel</button>
              <button className={styles.modalBtn2} onClick={handleCreateDeck}>create</button>
            </div>
          </div>
        </div>
      )}
      <div className={styles.decksGrid}>
        <div className={styles.deckWrapper} onClick={() => setShowNewDeckModal(true)}>
          <div className={styles.deckCard} />
          <div className={styles.deckCard} />
          <div className={`${styles.deckCard} ${styles.deckCardNew}`}>
            <span className={styles.deckName}>+ new deck</span>
          </div>
        </div>
        {decks.map((deck, index) => (
          <div key={deck.id ?? index} className={styles.deckWrapper} onClick={() => openDeck(deck)}>
            <div className={styles.deckCard} />
            <div className={styles.deckCard} />
            <div className={styles.deckCard}>
              <span className={styles.deckName}>{deck.name}</span>
              <span className={styles.deckCount}>{deck.flashcards?.length ?? 0} cards</span>
            </div>
          </div>
        ))}
        {decks.length === 0 && (
          <span className={styles.emptyState}>No decks yet — prompt your assistant to create one or create one above</span>
        )}
      </div>
    </div>
  )
}

export default Flashcards