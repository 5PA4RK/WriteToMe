// Supabase Configuration - Now using environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iipwepzadorscbnelvsc.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'your-anon-key-here';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// App State
const appState = {
    isHost: false,
    isConnected: false,
    userName: "Guest",
    userEmail: "",
    otherUserName: "Host",
    userId: null,
    sessionId: null,
    messages: [],
    currentImage: null,
    typingTimeout: null,
    connectionTime: null,
    adminVisible: false,
    realtimeSubscription: null
};

// DOM Elements (keep as is...)

// Initialize the app
async function initApp() {
    // Check for existing session
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        // User is already authenticated
        appState.userId = session.user.id;
        appState.userEmail = session.user.email;
        
        // Try to restore session
        await restoreUserSession(session.user);
    } else {
        connectionModal.style.display = 'flex';
    }

    setupEventListeners();
    
    // Listen for auth state changes
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            await restoreUserSession(session.user);
        } else if (event === 'SIGNED_OUT') {
            handleLogout();
        }
    });
}

// Updated handleConnect function
async function handleConnect() {
    const userSelect = document.getElementById('userSelect');
    const passwordInput = document.getElementById('passwordInput');
    
    const selectedRole = userSelect.value;
    const email = `${selectedRole}@writetome.com`; // Simple email pattern
    const password = passwordInput.value;
    
    // Reset errors
    passwordError.style.display = 'none';
    connectionError.style.display = 'none';
    
    if (!password) {
        passwordError.textContent = "Please enter a password";
        passwordError.style.display = 'block';
        passwordInput.focus();
        return;
    }
    
    // Show loading state
    connectBtn.disabled = true;
    connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
    
    try {
        // Sign in with Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (authError) {
            // If user doesn't exist, try to sign up (for initial setup)
            if (authError.message.includes('Invalid login credentials')) {
                const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            role: selectedRole
                        }
                    }
                });
                
                if (signUpError) throw signUpError;
                
                // Sign in after sign up
                const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (signInError) throw signInError;
                
                await completeConnection(signInData.user, selectedRole);
            } else {
                throw authError;
            }
        } else {
            await completeConnection(authData.user, selectedRole);
        }
    } catch (error) {
        console.error("Connection error:", error);
        passwordError.textContent = "Invalid credentials. Please try again.";
        passwordError.style.display = 'block';
    } finally {
        connectBtn.disabled = false;
        connectBtn.innerHTML = '<i class="fas fa-plug"></i> Connect';
    }
}

async function completeConnection(user, role) {
    appState.isHost = role === 'host';
    appState.userName = role === 'host' ? "Host" : "Guest";
    appState.userEmail = user.email;
    appState.userId = user.id;
    appState.sessionId = generateSessionId();
    appState.connectionTime = new Date();
    
    // Connect to session
    if (await connectToSupabase()) {
        appState.isConnected = true;
        connectionModal.style.display = 'none';
        updateUIAfterConnection();
        
        // Add connection message
        await saveMessageToDB('System', `${appState.userName} has connected to the chat.`);
        
        // Setup real-time subscriptions
        setupRealtimeSubscription();
        setupImageSubscription();
        
        if (appState.isHost) {
            adminPanel.style.display = 'block';
            refreshAdminInfo();
        }
    } else {
        connectionError.textContent = "Failed to connect to chat session";
        connectionError.style.display = 'block';
        await supabaseClient.auth.signOut();
    }
}

async function connectToSupabase() {
    try {
        // Check if session exists using the new secure_sessions table
        const { data: existingSessions, error: checkError } = await supabaseClient
            .from('secure_sessions')
            .select('*')
            .eq('is_active', true)
            .limit(1);
        
        if (checkError) throw checkError;
        
        if (existingSessions.length === 0) {
            if (appState.isHost) {
                // Host creates new session
                const { data: newSession, error: sessionError } = await supabaseClient
                    .from('secure_sessions')
                    .insert([
                        {
                            session_id: appState.sessionId,
                            host_id: appState.userId,
                            host_email: appState.userEmail,
                            is_active: true
                        }
                    ])
                    .select()
                    .single();
                
                if (sessionError) throw sessionError;
                return true;
            } else {
                alert("No active session found. Please ask the Host to create a session first.");
                return false;
            }
        } else {
            const session = existingSessions[0];
            
            // Check if session is full
            if (session.guest_id && session.guest_id !== appState.userId) {
                alert("Session is full. Only 2 users can connect at a time.");
                return false;
            }
            
            // Update session with guest info
            if (!appState.isHost) {
                const { error: updateError } = await supabaseClient
                    .from('secure_sessions')
                    .update({
                        guest_id: appState.userId,
                        guest_email: appState.userEmail
                    })
                    .eq('session_id', session.session_id);
                
                if (updateError) throw updateError;
            }
            
            appState.sessionId = session.session_id;
            appState.otherUserName = appState.isHost ? 
                (session.guest_email ? "Guest" : "Guest") : 
                "Host";
            
            return true;
        }
    } catch (error) {
        console.error("Error connecting to Supabase:", error);
        return false;
    }
}

async function restoreUserSession(user) {
    try {
        // Find active session for this user
        const { data: sessions, error } = await supabaseClient
            .from('secure_sessions')
            .select('*')
            .or(`host_id.eq.${user.id},guest_id.eq.${user.id}`)
            .eq('is_active', true)
            .limit(1);
        
        if (error || !sessions || sessions.length === 0) {
            // No active session, show connection modal
            connectionModal.style.display = 'flex';
            return;
        }
        
        const session = sessions[0];
        appState.sessionId = session.session_id;
        appState.isHost = session.host_id === user.id;
        appState.userName = appState.isHost ? "Host" : "Guest";
        appState.userEmail = user.email;
        appState.userId = user.id;
        appState.otherUserName = appState.isHost ? 
            (session.guest_email ? "Guest" : "Guest") : 
            "Host";
        appState.isConnected = true;
        
        connectionModal.style.display = 'none';
        updateUIAfterConnection();
        loadChatHistory();
        loadCurrentImage();
        
        setupRealtimeSubscription();
        setupImageSubscription();
        
        if (appState.isHost) {
            adminPanel.style.display = 'block';
            refreshAdminInfo();
        }
    } catch (error) {
        console.error("Error restoring session:", error);
        connectionModal.style.display = 'flex';
    }
}

// Update handleLogout to use auth
async function handleLogout() {
    if (confirm("Are you sure you want to logout?")) {
        await supabaseClient.auth.signOut();
        
        // Reset app state
        appState.isHost = false;
        appState.isConnected = false;
        appState.userName = "Guest";
        appState.userEmail = "";
        appState.userId = null;
        appState.sessionId = null;
        appState.messages = [];
        appState.currentImage = null;
        appState.realtimeSubscription = null;
        
        // Reset UI
        statusIndicator.classList.add('offline');
        userRoleDisplay.textContent = "Disconnected";
        currentUserSpan.textContent = "Guest";
        logoutBtn.style.display = 'none';
        messageInput.disabled = true;
        sendMessageBtn.disabled = true;
        uploadImageBtn.disabled = true;
        imageUrlInput.disabled = true;
        downloadImageBtn.disabled = true;
        adminPanel.style.display = 'none';
        
        // Clear chat and image
        chatMessages.innerHTML = '<div class="message received"><div class="message-sender">System</div><div>Welcome to WriteToMe! This is a secure chat room for two people only.</div><div class="message-time">Just now</div></div>';
        clearImage();
        
        // Show connection modal
        connectionModal.style.display = 'flex';
        
        // Reset login form
        document.getElementById('userSelect').value = 'host';
        document.getElementById('passwordInput').value = '';
        passwordError.style.display = 'none';
        connectionError.style.display = 'none';
    }
}

// Update other database operations to use the new table structure
// ... (update all database queries to use secure_sessions instead of sessions)

// Generate session ID (keep as is)
function generateSessionId() {
    return 'session_' + Date.now().toString(36);
}

// Keep the rest of your functions but update database table references
