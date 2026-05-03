import { motion } from "framer-motion";
import styles from "./index.module.css";
import { BrainCircuit } from "lucide-react" 

const Landing = ({ onEnter, loggedIn }: { onEnter: () => void, loggedIn: boolean }) => {
    return (
        <div className={styles.wrapper}>
            <motion.div
                className={styles.container}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
            >
                <motion.div
                    className={styles.brain}
                    animate={{ 
                        filter: [
                            'drop-shadow(0 0 8px #7c3aed) drop-shadow(0 0 20px #7c3aed)',
                            'drop-shadow(0 0 16px #a855f7) drop-shadow(0 0 40px #a855f7)',
                            'drop-shadow(0 0 8px #7c3aed) drop-shadow(0 0 20px #7c3aed)',
                        ]
                    }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                    <BrainCircuit className={styles.emptyBrain} />
                </motion.div>

                <motion.h1
                    className={styles.title}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.6 }}
                >
                    studyspace
                </motion.h1>

                <motion.p
                    className={styles.subtitle}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.6 }}
                >
                    your ai-powered study assistant
                </motion.p>

                <motion.button
                    className={styles.enterBtn}
                    onClick={onEnter}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7, duration: 0.4 }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.97 }}
                >
                    {loggedIn ? 'get started' : 'login'}
                </motion.button>
            </motion.div>
        </div>
    )
}

export default Landing;