import { useState } from "react";
import { supabase } from '../sbClient';

const Login = () => {

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    

    const handleLogin = async() => {
        const response = await supabase.auth.signInWithPassword({ email: email, password: password });
        if (response.error) {
            setError(response.error.message);
        }
    }

    const handleSignup = async() => {
        console.log(email);
        const response = await supabase.auth.signUp({ email: email, password: password });
        if (response.error) {
            setError(response.error.message);
        }
        console.log(response);
    }
    


    return (
        <>
        <div>
            Login/Signup
        </div>
        
        <div>
            User
        </div>
        <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="User"/>
    



        <div>
            Pass
        </div>
        <input value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password"/>

        <button onClick={handleLogin}>Press to login</button>
        <button onClick={handleSignup}>Press to signup</button>
        {error}

        </>
    )

}

export default Login;