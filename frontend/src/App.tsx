import { useEffect, useState } from 'react'
import './App.css'
import './themes.css'
import { supabase } from './sbClient';
import Login from './components/Login';
import Dashboard from './components/Dashboard/Dashboard';
import Landing from './components/Landing';
import { motion } from 'framer-motion';

function App() {
    const [session, setSession] = useState<any>(null);
    const [theme] = useState('theme-neural');
    const [showLanding, setShowLanding] = useState(true);
    const [showLogin, setShowLogin] = useState(false);

    useEffect(() => {
        const getSession = async() => {
            const response = await supabase.auth.getSession();
            setSession(response.data.session);
        }
        getSession();
        const listener = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) setShowLogin(false);
        })
        return () => listener.data.subscription.unsubscribe();
    }, [])

    useEffect(() => {
        document.documentElement.className = theme;
    }, [theme]);

    if (session) {
        if (showLanding) return <Landing loggedIn={true} onEnter={() => setShowLanding(false)} />
        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{ height: '100vh' }}
            >
                <Dashboard session={session} />
            </motion.div>
        )
    }

    if (showLogin) return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ height: '100vh' }}
        >
            <Login />
        </motion.div>
    )

    return <Landing loggedIn={false} onEnter={() => setShowLogin(true)} />
}

export default App;