import { supabase } from '../sbClient';

const Dashboard = () => {

    const handleLogout = async() => {
        await supabase.auth.signOut();
    }


    return <div>
        You're logged in!
        <button onClick={handleLogout}>
            Logout
        </button>

    </div>

}

export default Dashboard;