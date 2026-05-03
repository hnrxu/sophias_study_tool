import { useState } from "react";
import { supabase } from "../../sbClient"
import styles from "./index.module.css";

const Login = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [mode, setMode] = useState<'login' | 'signup'>('login');

    const handleLogin = async() => {
        const response = await supabase.auth.signInWithPassword({ email, password });
        if (response.error) setError(response.error.message);
    }

    const handleSignup = async() => {
        const response = await supabase.auth.signUp({ email, password });
        if (response.error) setError(response.error.message);
    }

    return (
        <div className={styles.wrapper}>
            <div className={styles.card}>
                <h2 className={styles.title}> studyspace</h2>
                <div className={styles.tabs}>
                    <button
                        className={mode === 'login' ? styles.tabActive : styles.tab}
                        onClick={() => { setMode('login'); setError('') }}
                    >
                        login
                    </button>
                    <button
                        className={mode === 'signup' ? styles.tabActive : styles.tab}
                        onClick={() => { setMode('signup'); setError('') }}
                    >
                        sign up
                    </button>
                </div>
                <div className={styles.fields}>
                    <input
                        className={styles.input}
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="email"
                        type="email"
                        onKeyDown={e => { if (e.key === 'Enter') mode === 'login' ? handleLogin() : handleSignup() }}
                    />
                    <input
                        className={styles.input}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="password"
                        type="password"
                        onKeyDown={e => { if (e.key === 'Enter') mode === 'login' ? handleLogin() : handleSignup() }}
                    />
                </div>
                {error && <p className={styles.error}>{error}</p>}
                <button
                    className={styles.submit}
                    onClick={mode === 'login' ? handleLogin : handleSignup}
                >
                    {mode === 'login' ? 'login' : 'sign up'}
                </button>
            </div>
        </div>
    )
}

export default Login;