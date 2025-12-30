// Supabase Configuration
const SUPABASE_URL = 'https://iipwepzadorscbnelvsc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_M3QVKHdt_hMdDQS7m4xWRA_8CC3wUah';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// App State
const appState = {
    isHost: false,
    isConnected: false,
    userName: "Guest",
    otherUserName: "Host",
    userId: null,
    sessionId: null,
    messages: [],
    currentImage: null,
    typingTimeout: null,
    connectionTime: null,
    adminVisible: false,
    realtimeSubscription: null,
    userIP: null
};

// DOM Elements
const connectionModal = document.getElementById('connectionModal');
const connectBtn = document.getElementById('connectBtn');
const passwordError = document.getElementById('passwordError');
const logoutBtn = document.getElementById('logoutBtn');
const statusIndicator = document.getElementById('statusIndicator');
const userRoleDisplay = document.getElementById('userRoleDisplay');
const currentUserSpan = document.getElementById('currentUser');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const imagePlaceholder = document.getElementById('imagePlaceholder');
const imagePreview = document.getElementById('imagePreview');
const fileInput = document.getElementById('fileInput');
const imageUrlInput = document.getElementById('imageUrlInput');
const uploadImageBtn = document.getElementById('uploadImageBtn');
const downloadImageBtn = document.getElementById('downloadImageBtn');
const clearImageBtn = document.getElementById('clearImageBtn');
const adminPanel = document.getElementById('adminPanel');
const adminToggle = document.getElementById('adminToggle');
const adminContent = document.getElementById('adminContent');
const adminInfo = document.getElementById('adminInfo');
const refreshInfoBtn = document.getElementById('refreshInfoBtn');
const typingIndicator = document.getElementById('typingIndicator');
const typingUser = document.getElementById('typingUser');

// Initialize the app
async function initApp() {
    // Get user's real IP address
    await getUserIP();
    
    // Check if user was previously connected
    const savedSession = localStorage.getItem('writeToMe_session');
    if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        appState.isHost = sessionData.isHost;
        appState.userName = sessionData.userName;
        appState.userId = sessionData.userId;
        appState.sessionId = sessionData.sessionId;
        appState.isConnected = true;
        
        if (await reconnectToSession()) {
            connectionModal.style.display = 'none';
            updateUIAfterConnection();
            loadChatHistory();
            loadCurrentImage();
        } else {
            localStorage.removeItem('writeToMe_session');
            connectionModal.style.display = 'flex';
        }
    } else {
        connectionModal.style.display = 'flex';
    }

    setupEventListeners();
}

// Get user's real IP address
async function getUserIP() {
    try {
        // Try multiple IP detection services as fallback
        const services = [
            'https://api.ipify.org?format=json',
            'https://ipapi.co/json/',
            'https://api.my-ip.io/ip.json'
        ];
        
        for (const service of services) {
            try {
                const response = await fetch(service, { 
                    signal: AbortSignal.timeout(3000) 
                });
                if (response.ok) {
                    const data = await response.json();
                    appState.userIP = data.ip || data.ip_address || data.ipString;
                    console.log('Detected IP:', appState.userIP);
                    break;
                }
            } catch (e) {
                console.log(`IP service ${service} failed, trying next...`);
            }
        }
        
        // If all services fail, use a placeholder
        if (!appState.userIP) {
            appState.userIP = 'IP_Detection_Failed';
        }
    } catch (error) {
        console.error('Error detecting IP:', error);
        appState.userIP = 'Unknown';
    }
}

// Set up event listeners
function setupEventListeners() {
    const userSelect = document.getElementById('userSelect');
    const passwordInput = document.getElementById('passwordInput');
    
    userSelect.addEventListener('change', function() {
        document.getElementById('passwordError').style.display = 'none';
    });

    passwordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleConnect();
    });

    connectBtn.addEventListener('click', handleConnect);
    logoutBtn.addEventListener('click', handleLogout);
    
    // Chat functionality
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    messageInput.addEventListener('input', handleTyping);
    sendMessageBtn.addEventListener('click', sendMessage);
    clearChatBtn.addEventListener('click', clearChat);
    
    // Image functionality
    imagePlaceholder.addEventListener('click', () => fileInput.click());
    imagePlaceholder.addEventListener('dragover', (e) => {
        e.preventDefault();
        imagePlaceholder.style.borderColor = 'var(--accent-orange)';
        imagePlaceholder.style.backgroundColor = 'rgba(255, 152, 0, 0.1)';
    });
    imagePlaceholder.addEventListener('dragleave', () => {
        imagePlaceholder.style.borderColor = 'var(--border-color)';
        imagePlaceholder.style.backgroundColor = '';
    });
    imagePlaceholder.addEventListener('drop', handleImageDrop);
    fileInput.addEventListener('change', handleFileSelect);
    uploadImageBtn.addEventListener('click', uploadImageFromUrl);
    downloadImageBtn.addEventListener('click', downloadImage);
    clearImageBtn.addEventListener('click', clearImage);
    imageUrlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') uploadImageFromUrl();
    });
    
    // Admin panel
    adminToggle.addEventListener('click', toggleAdminPanel);
    refreshInfoBtn.addEventListener('click', refreshAdminInfo);
}


// Handle connection with secure database authentication
async function handleConnect() {
    const userSelect = document.getElementById('userSelect');
    const passwordInput = document.getElementById('passwordInput');
    
    const selectedRole = userSelect.value;
    const password = passwordInput.value;
    
    passwordError.style.display = 'none';
    
    // Authenticate against database
    try {
        const { data: authResult, error } = await supabaseClient.rpc('authenticate_user', {
            user_role: selectedRole,
            user_password: password
        });
        
        if (error) {
            console.error('RPC Error:', error);
            passwordError.style.display = 'block';
            return;
        }
        
        if (authResult && authResult.success) {
            appState.isHost = selectedRole === 'host';
            appState.userName = appState.isHost ? "Host" : "Guest";
            
            appState.userId = generateUserId();
            appState.sessionId = generateSessionId();
            appState.connectionTime = new Date();
            
            if (await connectToSupabase()) {
                appState.isConnected = true;
                
                // Update auth log with IP
                if (authResult.log_id && appState.userIP) {
                    await supabaseClient
                        .from('auth_logs')
                        .update({ ip_address: appState.userIP })
                        .eq('id', authResult.log_id);
                }
                
                localStorage.setItem('writeToMe_session', JSON.stringify({
                    isHost: appState.isHost,
                    userName: appState.userName,
                    userId: appState.userId,
                    sessionId: appState.sessionId,
                    connectionTime: appState.connectionTime
                }));
                
                connectionModal.style.display = 'none';
                updateUIAfterConnection();
                await saveMessageToDB('System', `${appState.userName} has connected to the chat.`);
                setupRealtimeSubscription();
                setupImageSubscription();
                
                if (appState.isHost) {
                    adminPanel.style.display = 'block';
                    refreshAdminInfo();
                }
            } else {
                alert("Failed to connect to the server. Please try again.");
            }
        } else {
            passwordError.style.display = 'block';
            passwordInput.focus();
        }
    } catch (error) {
        console.error('Authentication error:', error);
        passwordError.style.display = 'block';
    }
}

// Generate a unique user ID with IP component
function generateUserId() {
    const ipPart = appState.userIP ? appState.userIP.replace(/[^a-zA-Z0-9]/g, '').substring(0, 8) : 'unknown';
    return `user_${ipPart}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Generate a session ID
function generateSessionId() {
    return 'session_' + Date.now().toString(36);
}

// Connect to Supabase and create/join session
async function connectToSupabase() {
    try {
        const { data: existingSessions, error: checkError } = await supabaseClient
            .from('sessions')
            .select('*')
            .eq('is_active', true)
            .limit(1);
        
        if (checkError) throw checkError;
        
        if (existingSessions.length === 0) {
            if (appState.isHost) {
                const { data: newSession, error: sessionError } = await supabaseClient
                    .from('sessions')
                    .insert([{
                        session_id: appState.sessionId,
                        host_id: appState.userId,
                        host_name: appState.userName,
                        host_ip: appState.userIP,
                        is_active: true,
                        created_at: new Date().toISOString()
                    }])
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
            
            if (session.guest_id && session.guest_id !== appState.userId) {
                alert("Session is full. Only 2 users can connect at a time.");
                return false;
            }
            
            if (!appState.isHost) {
                const { error: updateError } = await supabaseClient
                    .from('sessions')
                    .update({
                        guest_id: appState.userId,
                        guest_name: appState.userName,
                        guest_ip: appState.userIP,
                        guest_connected_at: new Date().toISOString()
                    })
                    .eq('session_id', session.session_id);
                
                if (updateError) throw updateError;
            }
            
            appState.sessionId = session.session_id;
            appState.otherUserName = appState.isHost ? (session.guest_name || "Guest") : session.host_name;
            
            return true;
        }
    } catch (error) {
        console.error("Error connecting to Supabase:", error);
        return false;
    }
}

// Reconnect to existing session
async function reconnectToSession() {
    try {
        const { data: session, error } = await supabaseClient
            .from('sessions')
            .select('*')
            .eq('session_id', appState.sessionId)
            .eq('is_active', true)
            .single();
        
        if (error || !session) return false;
        
        if (appState.isHost) {
            if (session.host_id !== appState.userId) return false;
            appState.otherUserName = session.guest_name || "Guest";
        } else {
            if (session.guest_id !== appState.userId) return false;
            appState.otherUserName = session.host_name;
        }
        
        setupRealtimeSubscription();
        setupImageSubscription();
        
        return true;
    } catch (error) {
        console.error("Error reconnecting:", error);
        return false;
    }
}

// Update UI after connection
function updateUIAfterConnection() {
    statusIndicator.classList.remove('offline');
    userRoleDisplay.textContent = `${appState.userName} (Connected)`;
    currentUserSpan.textContent = appState.userName;
    
    logoutBtn.style.display = 'flex';
    messageInput.disabled = false;
    sendMessageBtn.disabled = false;
    messageInput.focus();
    
    uploadImageBtn.disabled = false;
    imageUrlInput.disabled = false;
}

// Handle logout
async function handleLogout() {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem('writeToMe_session');
        
        if (appState.isConnected && appState.sessionId) {
            try {
                if (appState.isHost) {
                    await supabaseClient
                        .from('sessions')
                        .update({ 
                            is_active: false, 
                            ended_at: new Date().toISOString(),
                            guest_id: null,
                            guest_name: null,
                            guest_connected_at: null
                        })
                        .eq('session_id', appState.sessionId);
                } else {
                    await supabaseClient
                        .from('sessions')
                        .update({ 
                            guest_id: null, 
                            guest_name: null, 
                            guest_connected_at: null 
                        })
                        .eq('session_id', appState.sessionId);
                }
            } catch (error) {
                console.error("Error updating session on logout:", error);
            }
        }
        
        appState.isHost = false;
        appState.isConnected = false;
        appState.userName = "Guest";
        appState.userId = null;
        appState.sessionId = null;
        appState.messages = [];
        appState.currentImage = null;
        appState.realtimeSubscription = null;
        
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
        
        chatMessages.innerHTML = '<div class="message received"><div class="message-sender">System</div><div>Welcome to WriteToMe! This is a secure chat room for two people only.</div><div class="message-time">Just now</div></div>';
        clearImage();
        
        connectionModal.style.display = 'flex';
        document.getElementById('userSelect').value = 'guest';
        document.getElementById('passwordInput').value = '';
        document.getElementById('passwordError').style.display = 'none';
    }
}

// Setup real-time subscription for messages
function setupRealtimeSubscription() {
    console.log('🔄 Setting up real-time subscription for session:', appState.sessionId);
    
    if (appState.realtimeSubscription) {
        supabaseClient.removeChannel(appState.realtimeSubscription);
    }
    
    appState.realtimeSubscription = supabaseClient
        .channel('messages-channel-' + appState.sessionId)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: 'session_id=eq.' + appState.sessionId
        }, (payload) => {
            console.log('📨 REAL-TIME EVENT RECEIVED:', payload);
            if (payload.new.sender_id !== appState.userId) {
                console.log('✅ Displaying message from other user');
                displayMessage({
                    id: payload.new.id,
                    sender: payload.new.sender_name,
                    text: payload.new.message,
                    time: new Date(payload.new.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                    type: 'received'
                });
            }
        })
        .subscribe((status) => {
            console.log('📡 Subscription status:', status);
        });
}

// Setup real-time subscription for images
function setupImageSubscription() {
    supabaseClient
        .channel('images-channel-' + appState.sessionId)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'sessions',
            filter: 'session_id=eq.' + appState.sessionId
        }, (payload) => {
            const updatedSession = payload.new;
            if (updatedSession.current_image && updatedSession.current_image !== appState.currentImage) {
                appState.currentImage = updatedSession.current_image;
                displayImage(updatedSession.current_image);
                downloadImageBtn.disabled = false;
                addSystemMessage(`${appState.otherUserName} shared an image.`);
            }
        })
        .subscribe();
}

// Load chat history from database
async function loadChatHistory() {
    try {
        const { data: messages, error } = await supabaseClient
            .from('messages')
            .select('*')
            .eq('session_id', appState.sessionId)
            .order('created_at', { ascending: true });
        
        if (error) throw error;
        
        chatMessages.innerHTML = '';
        appState.messages = [];
        
        messages.forEach(msg => {
            const messageType = msg.sender_id === appState.userId ? 'sent' : 'received';
            displayMessage({
                id: msg.id,
                sender: msg.sender_name,
                text: msg.message,
                time: new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                type: messageType
            });
        });
    } catch (error) {
        console.error("Error loading chat history:", error);
    }
}

// Load current image from database
async function loadCurrentImage() {
    try {
        const { data: session, error } = await supabaseClient
            .from('sessions')
            .select('current_image')
            .eq('session_id', appState.sessionId)
            .single();
        
        if (error) throw error;
        
        if (session.current_image) {
            appState.currentImage = session.current_image;
            displayImage(session.current_image);
            downloadImageBtn.disabled = false;
        }
    } catch (error) {
        console.error("Error loading current image:", error);
    }
}

// Save message to database
async function saveMessageToDB(senderName, messageText) {
    try {
        const { data, error } = await supabaseClient
            .from('messages')
            .insert([{
                session_id: appState.sessionId,
                sender_id: appState.userId,
                sender_name: senderName,
                message: messageText,
                created_at: new Date().toISOString()
            }])
            .select()
            .single();
        
        if (error) throw error;
        return data;
    } catch (error) {
        console.error("Error saving message to database:", error);
        return null;
    }
}

// Send a chat message
async function sendMessage() {
    const messageText = messageInput.value.trim();
    if (!messageText) return;
    
    const message = {
        id: Date.now(),
        sender: appState.userName,
        text: messageText,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        type: 'sent'
    };
    
    appState.messages.push(message);
    displayMessage(message);
    messageInput.value = '';
    await saveMessageToDB(appState.userName, messageText);
}

// Display a message in the chat
function displayMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.type}`;
    messageDiv.id = `msg-${message.id}`;
    
    messageDiv.innerHTML = `
        <div class="message-sender">${message.sender}</div>
        <div>${message.text}</div>
        <div class="message-time">${message.time}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add a system message
function addSystemMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message received';
    
    messageDiv.innerHTML = `
        <div class="message-sender">System</div>
        <div>${text}</div>
        <div class="message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    saveMessageToDB('System', text);
}

// Handle typing indicator
function handleTyping() {
    if (appState.typingTimeout) {
        clearTimeout(appState.typingTimeout);
    }
}

// Clear chat history
async function clearChat() {
    if (confirm("Are you sure you want to clear all chat messages?")) {
        try {
            const { error } = await supabaseClient
                .from('messages')
                .delete()
                .eq('session_id', appState.sessionId);
            
            if (error) throw error;
            
            chatMessages.innerHTML = '';
            appState.messages = [];
            addSystemMessage("Chat history has been cleared.");
        } catch (error) {
            console.error("Error clearing chat:", error);
            alert("Error clearing chat. Please try again.");
        }
    }
}

// Handle image drop
function handleImageDrop(e) {
    e.preventDefault();
    imagePlaceholder.style.borderColor = 'var(--border-color)';
    imagePlaceholder.style.backgroundColor = '';
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith('image/')) {
            loadImageFile(file);
        } else {
            alert("Please drop an image file only.");
        }
    }
}

// Handle file selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
        loadImageFile(file);
    }
}

// Load image file
function loadImageFile(file) {
    if (file.size > 5 * 1024 * 1024) {
        alert("Image size should be less than 5MB.");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        appState.currentImage = e.target.result;
        displayImage(appState.currentImage);
        downloadImageBtn.disabled = false;
        await saveImageToDB(appState.currentImage);
        addSystemMessage(`${appState.userName} shared an image.`);
    };
    reader.readAsDataURL(file);
}

// Upload image from URL
async function uploadImageFromUrl() {
    const url = imageUrlInput.value.trim();
    if (!url) return;
    
    if (!url.match(/\.(jpeg|jpg|gif|png|webp)$/)) {
        alert("Please enter a valid image URL (jpg, png, gif, webp).");
        return;
    }
    
    appState.currentImage = url;
    displayImage(url);
    downloadImageBtn.disabled = false;
    await saveImageToDB(url);
    addSystemMessage(`${appState.userName} shared an image from URL.`);
    imageUrlInput.value = '';
}

// Save image to database
async function saveImageToDB(imageData) {
    try {
        const { error } = await supabaseClient
            .from('sessions')
            .update({ current_image: imageData })
            .eq('session_id', appState.sessionId);
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error("Error saving image to database:", error);
        alert("Error saving image. Please try again.");
        return false;
    }
}

// Display image in preview
function displayImage(src) {
    imagePreview.src = src;
    imagePreview.style.display = 'block';
    imagePlaceholder.style.display = 'none';
}

// Download image
function downloadImage() {
    if (!appState.currentImage) return;
    
    const link = document.createElement('a');
    link.href = appState.currentImage;
    link.download = `WriteToMe_Image_${new Date().getTime()}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addSystemMessage(`${appState.userName} downloaded the image.`);
}

// Clear image
async function clearImage() {
    if (confirm("Are you sure you want to clear the image?")) {
        try {
            const { error } = await supabaseClient
                .from('sessions')
                .update({ current_image: null })
                .eq('session_id', appState.sessionId);
            
            if (error) throw error;
            
            appState.currentImage = null;
            imagePreview.style.display = 'none';
            imagePlaceholder.style.display = 'flex';
            downloadImageBtn.disabled = true;
            addSystemMessage(`${appState.userName} cleared the image.`);
        } catch (error) {
            console.error("Error clearing image:", error);
            alert("Error clearing image. Please try again.");
        }
    }
}

// Toggle admin panel visibility
function toggleAdminPanel() {
    appState.adminVisible = !appState.adminVisible;
    adminContent.classList.toggle('show', appState.adminVisible);
    
    const chevron = adminToggle.querySelector('i.fa-chevron-down');
    if (appState.adminVisible) {
        chevron.className = 'fas fa-chevron-up';
    } else {
        chevron.className = 'fas fa-chevron-down';
    }
}

// Refresh admin information with real IPs
async function refreshAdminInfo() {
    if (!appState.isHost) return;
    
    try {
        const { data: session, error } = await supabaseClient
            .from('sessions')
            .select('*')
            .eq('session_id', appState.sessionId)
            .single();
        
        if (error) throw error;
        
        const connectionDuration = appState.connectionTime 
            ? Math.floor((new Date() - new Date(appState.connectionTime)) / 1000)
            : 0;
        
        const minutes = Math.floor(connectionDuration / 60);
        const seconds = connectionDuration % 60;
        
        const { count: messageCount } = await supabaseClient
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', appState.sessionId);
        
        adminInfo.innerHTML = `
            <div class="info-card">
                <h4><i class="fas fa-user"></i> Host Information</h4>
                <p><strong>Name:</strong> ${session.host_name}</p>
                <p><strong>IP Address:</strong> ${session.host_ip || 'Unknown'}</p>
                <p><strong>ID:</strong> ${session.host_id.substring(0, 15)}...</p>
                <p><strong>Session Started:</strong> ${new Date(session.created_at).toLocaleTimeString()}</p>
                <p><strong>Duration:</strong> ${minutes}m ${seconds}s</p>
            </div>
            <div class="info-card">
                <h4><i class="fas fa-user-friends"></i> Guest Information</h4>
                <p><strong>Name:</strong> ${session.guest_name || 'Not connected'}</p>
                <p><strong>IP Address:</strong> ${session.guest_ip || 'Unknown'}</p>
                <p><strong>ID:</strong> ${session.guest_id ? session.guest_id.substring(0, 15) + '...' : 'N/A'}</p>
                <p><strong>Connected:</strong> ${session.guest_connected_at ? new Date(session.guest_connected_at).toLocaleTimeString() : 'N/A'}</p>
                <p><strong>Status:</strong> ${session.guest_id ? 'Connected' : 'Disconnected'}</p>
            </div>
            <div class="info-card">
                <h4><i class="fas fa-shield-alt"></i> Session Information</h4>
                <p><strong>Session ID:</strong> ${session.session_id.substring(0, 20)}...</p>
                <p><strong>Messages:</strong> ${messageCount || 0}</p>
                <p><strong>Active:</strong> ${session.is_active ? 'Yes' : 'No'}</p>
                <p><strong>Last Activity:</strong> ${new Date().toLocaleTimeString()}</p>
            </div>
        `;
    } catch (error) {
        console.error("Error refreshing admin info:", error);
        adminInfo.innerHTML = `<div class="info-card"><p>Error loading admin information.</p></div>`;
    }
}

// Initialize the app when page loads
document.addEventListener('DOMContentLoaded', initApp);
