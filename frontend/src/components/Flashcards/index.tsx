import { useState, useRef, useEffect, useCallback } from "react"
import styles from './index.module.css'
import { supabase } from "../../sbClient"

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

const Flashcards = ({ decks }) => {
  const [selectedDeck, setSelectedDeck] = useState<any>(null)
  const [studyMode, setStudyMode] = useState<StudyMode>(DEFAULT_MODE)
  const [, setModeStateVersion] = useState(0)

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

  const clampIndex = (i: number) => {
    return Math.max(0, Math.min(i, queue.length - 1))
  }

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

      if (dist < minDist) {
        minDist = dist
        closest = i
      }
    })

    return closest
  }

  const centerCard = (i: number, behavior: ScrollBehavior = "smooth") => {
    const track = carouselRef.current
    if (!track) return

    const card = track.children[i] as HTMLElement
    if (!card) return

    isProgrammaticScrollRef.current = true

    card.scrollIntoView({
      behavior,
      block: "nearest",
      inline: "center",
    })

    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false
    }, behavior === "smooth" ? 200 : 80)
  }

  const centerIndexAfterQueueChange = (index: number) => {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
        centerCard(index, "instant")
        })
    })
    }

  const scrollTo = (i: number) => {
    if (!selectedDeck) return
    if (queue.length === 0) return

    const nextIndex = clampIndex(i)

    setModeState(selectedDeck.id, studyMode, {
      currentIndex: nextIndex,
      flipped: false,
    })

    centerCard(nextIndex)
  }

  const moveBy = (direction: -1 | 1) => {
    scrollTo(currentIndex + direction)
  }

  const handleScroll = () => {
    if (!selectedDeck) return
    if (isProgrammaticScrollRef.current) return

    if (scrollEndTimeoutRef.current) {
      clearTimeout(scrollEndTimeoutRef.current)
    }

    scrollEndTimeoutRef.current = setTimeout(() => {
      const closest = getCenteredIndex()

      if (closest !== currentIndex) {
        setModeState(selectedDeck.id, studyMode, {
          currentIndex: closest,
          flipped: false,
        })
      }
    }, 80)
  }

  const setFlipped = (val: boolean | ((prev: boolean) => boolean)) => {
    if (!selectedDeck) return

    const next = typeof val === 'function' ? val(flipped) : val

    setModeState(selectedDeck.id, studyMode, {
      flipped: next,
    })
  }

  const openDeck = (deck: any) => {
    const lastMode = deckMetaRef.current[deck.id]?.mode ?? DEFAULT_MODE

    ;(['default', 'simple', 'spaced'] as StudyMode[]).forEach(m => {
      initModeStateIfNeeded(deck, m)
    })

    setSelectedDeck(deck)
    setStudyMode(lastMode)
    setModeStateVersion(v => v + 1)
  }

  const closeDeck = () => {
    setSelectedDeck(null)
  }

  const switchMode = (mode: StudyMode) => {
    if (!selectedDeck) return

    initModeStateIfNeeded(selectedDeck, mode)
    deckMetaRef.current[selectedDeck.id] = { mode }

    setStudyMode(mode)
    setModeStateVersion(v => v + 1)
  }

  useEffect(() => {
    if (!selectedDeck) return

    const idx =
      modeStateRef.current[modeKey(selectedDeck.id, studyMode)]?.currentIndex ?? 0

    requestAnimationFrame(() => {
      centerCard(idx, "instant")
    })
  }, [selectedDeck, studyMode])

  useEffect(() => {
    return () => {
      if (scrollEndTimeoutRef.current) {
        clearTimeout(scrollEndTimeoutRef.current)
      }
    }
  }, [])

  const sm2 = (card: any, score: number) => {
    const easiness = Math.max(1.3, card.easiness + 0.1 - (5 - score) * 0.08)

    let interval

    if (score === 0) {
        interval = 0
    } else if (score === 2) {
        interval = 1
    } else if (score === 3) {
        interval = Math.max(1, Math.round(card.interval * 1.2))
    } else {
        interval = Math.max(1, Math.round(card.interval * easiness))
    }

    const due = new Date()
    due.setDate(due.getDate() + interval)

    return {
      easiness,
      interval,
      due: due.toISOString(),
    }
  }

  const scores = [
    { score: 0, label: 'blackout', color: '#e74c3c' },
    { score: 2, label: 'hard', color: '#f1c40f' },
    { score: 3, label: 'ok', color: '#2ecc71' },
    { score: 5, label: 'perfect', color: '#1abc9c' },
  ]

  const buildSessionQueue = () => {
    if (!selectedDeck) return

    const fresh: ModeState = {
      queue: buildInitialQueue(selectedDeck, studyMode),
      currentIndex: 0,
      flipped: false,
    }

    modeStateRef.current[modeKey(selectedDeck.id, studyMode)] = fresh
    setModeStateVersion(v => v + 1)

    requestAnimationFrame(() => {
      centerCard(0, "instant")
    })
  }

  const handleGotIt = () => {
    if (!selectedDeck) return

    const next = queue.filter((_, i) => i !== currentIndex)
    const nextIndex = Math.min(currentIndex, next.length - 1)

    setModeState(selectedDeck.id, studyMode, {
        queue: next,
        currentIndex: nextIndex,
        flipped: false,
    })

    centerIndexAfterQueueChange(nextIndex)
    }

  const handleMissed = () => {
    if (!selectedDeck) return

    const removed = queue[currentIndex]
    const next = [...queue.filter((_, i) => i !== currentIndex), removed]
    const nextIndex = Math.min(currentIndex, next.length - 1)

    setModeState(selectedDeck.id, studyMode, {
        queue: next,
        currentIndex: nextIndex,
        flipped: false,
    })

    centerIndexAfterQueueChange(nextIndex)
    }

    const learningSteps: Record<number, number | null> = {
        0: 1,     // blackout: after 1 upcoming card
        2: 3,     // hard: after 3 upcoming cards
        3: 6,     // ok: after 6 upcoming cards
        5: null,  // perfect: remove from today's queue
    }

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

            next = [
            ...rest.slice(0, insertIndex),
            updated,
            ...rest.slice(insertIndex),
            ]
        }

        const nextIndex = Math.min(currentIndex, next.length - 1)

        setModeState(selectedDeck.id, studyMode, {
            queue: next,
            currentIndex: nextIndex,
            flipped: false,
        })

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

    if ((studyMode === 'simple' || studyMode === 'spaced') && queue.length === 0) {
      return (
        <div className={styles.flashcardsPage}>
          <button className={styles.backBtn} onClick={closeDeck}>
            ← back to decks
          </button>

          <div className={styles.headingWrapper}>
            <div className={styles.heading}>
              <p className={styles.deckTitle}>{selectedDeck.name}</p>
              <span className={styles.cardCounter}>0 / 0</span>
            </div>

            <ModeBar />
          </div>

          <div className={styles.doneState}>
            <p className={styles.doneTitle}>deck complete!</p>
            <p className={styles.doneDesc}>you got through all the cards</p>
            <button className={styles.restartBtn} onClick={buildSessionQueue}>
              restart
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className={styles.flashcardsPage}>
        <button className={styles.backBtn} onClick={closeDeck}>
          ← back to decks
        </button>

        <div className={styles.headingWrapper}>
          <div className={styles.heading}>
            <p className={styles.deckTitle}>{selectedDeck.name}</p>
            <span className={styles.cardCounter}>
              {currentIndex + 1} / {cards.length}
            </span>
          </div>

          <ModeBar />
        </div>

        <div className={styles.carouselWrapper}>
          <button
            className={styles.carouselArrow}
            onClick={() => moveBy(-1)}
            disabled={currentIndex === 0}
          >
            ‹
          </button>

          <div
            className={styles.carouselTrack}
            ref={carouselRef}
            onScroll={handleScroll}
          >
            {cards.map((card, i) => (
              <div
                key={card.id ?? i}
                className={`${styles.carouselCard} ${i === currentIndex ? styles.carouselCardActive : ''}`}
                onClick={() => {
                  if (i === currentIndex) {
                    setFlipped(f => !f)
                  } else {
                    scrollTo(i)
                  }
                }}
              >
                <p>{i === currentIndex && flipped ? card.answer : card.question}</p>

                {i === currentIndex && (
                  <span className={styles.flipHint}>
                    {flipped ? 'answer' : 'question'} — click to flip
                  </span>
                )}
              </div>
            ))}
          </div>

          <button
            className={styles.carouselArrow}
            onClick={() => moveBy(1)}
            disabled={currentIndex === cards.length - 1}
          >
            ›
          </button>
        </div>

        <div className={styles.studyControls}>
          {studyMode === 'simple' && (
            <>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{
                    width: `${((selectedDeck.flashcards.length - queue.length) / selectedDeck.flashcards.length) * 100}%`,
                  }}
                />
              </div>

              <div className={styles.answerBtns}>
                <button className={styles.missedBtn} onClick={handleMissed}>
                  ✕ missed it
                </button>

                <button className={styles.gotItBtn} onClick={handleGotIt}>
                  ✓ got it
                </button>
              </div>
            </>
          )}

          {studyMode === 'spaced' && (
            <div className={styles.answerBtns}>
              {scores.map(({ score, label, color }) => (
                <button
                  key={score}
                  className={styles.ratingBtn}
                  style={{ borderColor: color, color }}
                  onClick={() => handleSpaced(score)}
                >
                  {score}
                  <span>{label}</span>
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
      <div className={styles.decksGrid}>
        {decks.length !== 0 && decks.map((deck, index) => (
          <div
            key={deck.id ?? index}
            className={styles.deckWrapper}
            onClick={() => openDeck(deck)}
          >
            <div className={styles.deckCard} />
            <div className={styles.deckCard} />

            <div className={styles.deckCard}>
              <span className={styles.deckName}>{deck.name}</span>
              <span className={styles.deckCount}>
                {deck.flashcards?.length ?? 0} cards
              </span>
            </div>
          </div>
        ))}

        {decks.length === 0 && (
          <span className={styles.emptyState}>No decks created yet</span>
        )}
      </div>
    </div>
  )
}

export default Flashcards