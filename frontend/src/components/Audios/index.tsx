import styles from "./index.module.css";

type AudioFile = {
    url: string;
    path: string;
    fileName: string;
}

type AudiosProps = {
    audioFiles: AudioFile[];
    asmrFiles: AudioFile[];
    onDelete: (file: AudioFile) => void;
}

const handleDownload = async (url: string, fileName: string) => {
    const res = await fetch(url)
    const blob = await res.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${fileName}.mp3`
    a.click()
    URL.revokeObjectURL(a.href)
}



const Audios = ({ audioFiles, asmrFiles, onDelete }: AudiosProps) => {
    return (
        <div className={styles.wrapper}>
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>Audio Notes</h3>
                {audioFiles.length === 0
                    ? <p className={styles.empty}>no audio notes yet</p>
                    : audioFiles.map((file) => (
                        <div key={file.path} className={styles.audioItem}>
                            <div className={styles.audioItemHeader}>
                                <span className={styles.fileName}>{file.fileName}</span>
                                <div className={styles.audioActions}>
                                    <button onClick={() => handleDownload(file.url, file.fileName)} className={styles.downloadBtn}>↓ download</button>
                                    <button onClick={() => onDelete(file)} className={styles.deleteBtn}>✕</button>
                                </div>
                            </div>
                            <audio controls src={file.url} className={styles.audioPlayer} />
                        </div>
                    ))
                }
            </div>
            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>ASMR Notes</h3>
                {asmrFiles.length === 0
                    ? <p className={styles.empty}>no asmr notes yet</p>
                    : asmrFiles.map((file) => (
                        <div key={file.path} className={styles.audioItem}>
                            <div className={styles.audioItemHeader}>
                                <span className={styles.fileName}>{file.fileName}</span>
                                <button onClick={() => handleDownload(file.url, file.fileName)} className={styles.downloadBtn}>↓ download</button>
                                <button onClick={() => onDelete(file)} className={styles.deleteBtn}>✕</button>
                            </div>
                            <audio controls src={file.url} className={styles.audioPlayer} />
                        </div>
                    ))
                }
            </div>
        </div>
    )
}

export default Audios;