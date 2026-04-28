import { useEffect, useState } from 'react'

import './App.css'
import { supabase } from './sbClient';
import Login from './components/Login';


function App() {
    const [session, setSession] = useState(null);
    
    const [systems, setSystems] = useState([]);
    const [systemName, setSystemName] = useState("");
    const [query, setQuery] = useState("");
    const [selectedFiles, setSelectedFiles] = useState([]);
    const [success, setSuccess] = useState(false);
    const [response, setResponse] = useState("");
    const [sources, setSources] = useState([]);

    useEffect(() => {
        const getSession = async() => {
            const response = await supabase.auth.getSession();
            setSession(response.data.session);
        }
        getSession();
        const listener = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
        })
        return () => listener.data.subscription.unsubscribe();
    }, [])

    

    

    const handleCreateSystem = async(name: string) => {
        const response = await supabase
                                .from('systems')
                                .insert({user_id: session.user.id, name})
        if (response.error) {
            console.log(response.error);
        }
        if (!response.error) {
            getSystems();
        }
    }

    const getSystems = async() => {
        const response = await supabase
                                .from('systems')
                                .select("*")
                                .eq('user_id', session.user.id)
        setSystems(response.data);
    }

    useEffect(() => {
        if (session) getSystems();
    }, [session])

    

    

    const handleUpload = async(files, systemId) => {
        const formData = new FormData();

        for (const file of files) {
            formData.append('files', file);

            // const response = await supabase.storage
            //                     .from('files')
            //                     .upload(`${session.user.id}/${systemId}/${file.name}`, file)
            // if (response.error) console.log(response.error);
            // if (!response.error) {
            //     setSuccess(true);
            // }
            
        }

        formData.append('systemId', systemId);
        formData.append('userId', session.user.id);


        // uploads to backend (change hardcoded link later)
        const response = await fetch('http://localhost:3000/upload', {
            method: 'POST',
            body: formData
        })

        // wait for success/error mesage 
        const message = await response.text();
        console.log(message);


    }


    const handleSearch = async(systemId) => {


        // uploads to backend (change hardcoded link later)
        const response = await fetch('http://localhost:3000/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ systemId: systemId, query: query, userId: session.user.id })
        })

        // wait for success/error mesage 
        const responsejson = await response.json();
        const content = responsejson.answer;
        setResponse(content);

        const signedUrls = await Promise.all(responsejson.sources.map(async (path) => {
            const { data } = await supabase.storage
                .from('files')
                .createSignedUrl(path, 3600);
            return data.signedUrl;
        }))

        setSources(signedUrls);
    }
    

    if (session) {
        return <div>
                

                <input type="text" placeholder="system name" value={systemName} onChange={e=>setSystemName(e.target.value)}/>
                <button onClick={()=>handleCreateSystem(systemName)}>create new system</button>

                {systems.map((system, index) => (
                    <div key={index}>

                        <span>{system.name}</span>
                        <input type="file" multiple accept=".pdf" onChange={e=> {
                                                                    setSelectedFiles(Array.from(e.target.files))
                                                                    setSuccess(false)}}/>
                                                                    
                        <button onClick={()=>handleUpload(selectedFiles, system.id)}>upload files</button>
                        {success && <span>Upload successful</span>}

                        <input type="text" placeholder="SEARCH IN THE SYSTEM" value={query} onChange={e=>setQuery(e.target.value)}/>
                        <button onClick={()=>handleSearch(system.id)}>Search</button>

                        <span>{response}</span>
                        {sources.map((url, index) => (
                        <iframe key={index} src={url} width="100%" height="600px" />
                        ))}
                    </div>
                ))}
                </div>
    }

    return (
       <Login></Login>
    )
    }

export default App;
