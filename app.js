// Supabase Configuration
const SUPABASE_URL = 'https://iipwepzadorscbnelvsc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlpcHdlcHphZG9yc2NibmVsdnNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzU1NTc0MTQsImV4cCI6MjA1MTEzMzQxNH0.qlwkVPvM2ag7-czhRSCfqB0B1yITsMJgV1QpCLmN8rQ';

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

// DOM Elements
const connectionModal = document.getElementById('connectionModal');
const connectBtn = document.getElementById('connectBtn');
const passwordError = document.getElementById('passwordError');
const connectionError = document.getElementById('connectionError');
const logoutBtn = document.getElementById('logoutBtn');
const emailInput = document.getElementById('emailInput');
const userSelect = document.getElementById('userSelect');
const passwordInput = document.getElementById('passwordInput');

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

// Email mapping based on role
const EMAIL_MAPPING = {
    host: 'host@writetome.com',
    guest: 'guest@writetome.com'
};

// Initialize the app
async function initApp() {
    // Set up event listeners FIRST
    setupEventListeners();
    
    // Set initial email based on default role
    updateEmailBasedOnRole();
    
    // Check for existing session
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    if (session) {
        // User is already authenticated
        appState.userId = session.user.id;
        appState.userEmail = session.user.email;
        appState.userName = session.user.email.includes('host') ? 'Host' : 'Guest';
        appState.isHost = session.user.email.includes('host');
        
        // Try to restore session
        await restoreUserSession(session.user);
    } else {
        connectionModal.style.display = 'flex';
    }
    
    // Listen for auth state changes
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
            await restoreUserSession(session.user);
        } else if (event === 'SIGNED_OUT') {
            handleLogout();
        }
    });
}

// Update email input based on selected role
function updateEmailBasedOnRole() {
    if (!userSelect || !emailInput) return;
    
    const role = userSelect.value;
    const email = EMAIL_MAPPING[role] || '';
    emailInput.value = email;
    
    // Clear password when role changes
    if (passwordInput) {
        passwordInput.value = '';
    }
    
    // Focus on password field for better UX
    if (passwordInput) {
        setTimeout(() => {
            passwordInput.focus();
        }, 100);
    }
}

// Set up all event listeners
function setupEventListeners() {
    // Update email when role changes
    if (userSelect) {
        userSelect.addEventListener('change', updateEmailBasedOnRole);
    }
    
    // Allow Enter key in password field
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleConnect();
        });
    }

    // Connect button
    if (connectBtn) {
        connectBtn.addEventListener('click', handleConnect);
    }

    // Logout button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Chat functionality
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
        messageInput.addEventListener('input', handleTyping);
    }
    
    if (sendMessageBtn) {
        sendMessageBtn.addEventListener('click', sendMessage);
    }
    
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', clearChat);
    }

    // Image functionality
    if (imagePlaceholder) {
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
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    
    if (uploadImageBtn) {
        uploadImageBtn.addEventListener('click', uploadImageFromUrl);
    }
    
    if (downloadImageBtn) {
        downloadImageBtn.addEventListener('click', downloadImage);
    }
    
    if (clearImageBtn) {
        clearImageBtn.addEventListener('click', clearImage);
    }
    
    if (imageUrlInput) {
        imageUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') uploadImageFromUrl();
        });
    }

    // Admin panel
    if (adminToggle) {
        adminToggle.addEventListener('click', toggleAdminPanel);
    }
    
    if (refreshInfoBtn) {
        refreshInfoBtn.addEventListener('click', refreshAdminInfo);
    }
}

// Handle connection with Supabase authentication
async function handleConnect() {
    if (!emailInput || !passwordInput) return;
    
    const email = emailInput.value;
    const password = passwordInput.value;
    
    // Reset errors
    if (passwordError) passwordError.style.display = 'none';
    if (connectionError) connectionError.style.display = 'none';
    
    if (!password) {
        if (passwordError) {
            passwordError.textContent = "Please enter a password";
            passwordError.style.display = 'block';
        }
        if (passwordInput) passwordInput.focus();
        return;
    }
    
    // Validate email format
    if (!email || !email.includes('@')) {
        if (passwordError) {
            passwordError.textContent = "Please select a valid role";
            passwordError.style.display = 'block';
        }
        return;
    }
    
    // Show loading state
    if (connectBtn) {
        connectBtn.disabled = true;
        connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Connecting...';
    }
    
    try {
        // Sign in with Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (authError) {
            console.error("Auth error:", authError);
            
            let errorMessage = "Authentication failed. Please try again.";
            
            if (authError.message.includes('Invalid login credentials')) {
                errorMessage = "Invalid password. Please check your password.";
            } else if (authError.message.includes('Email not confirmed')) {
                errorMessage = "Please confirm your email address first.";
            }
            
            if (passwordError) {
                passwordError.textContent = errorMessage;
                passwordError.style.display = 'block';
            }
            return;
        }
        
        // Authentication successful
        const user = authData.user;
        const isHost = email.includes('host');
        
        appState.isHost = isHost;
        appState.userName = isHost ? "Host" : "Guest";
        appState.userEmail = user.email;
        appState.userId = user.id;
        appState.sessionId = generateSessionId();
        appState.connectionTime = new Date();
        
        // Connect to session
        if (await connectToSession()) {
            appState.isConnected = true;
            if (connectionModal) connectionModal.style.display = 'none';
            updateUIAfterConnection();
            
            // Add connection message
            await saveMessageToDB('System', `${appState.userName} has connected to the chat.`);
            
            // Setup real-time subscriptions
            setupRealtimeSubscription();
            setupImageSubscription();
            
            if (appState.isHost && adminPanel) {
                adminPanel.style.display = 'block';
                refreshAdminInfo();
            }
        } else {
            if (connectionError) {
                connectionError.textContent = "Failed to connect to chat session";
                connectionError.style.display = 'block';
            }
        }
    } catch (error) {
        console.error("Connection error:", error);
        if (connectionError) {
            connectionError.textContent = "Connection error. Please try again.";
            connectionError.style.display = 'block';
        }
    } finally {
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.innerHTML = '<i class="fas fa-plug"></i> Connect';
        }
    }
}

// Generate a session ID
function generateSessionId() {
    return 'session_' + Date.now().toString(36);
}

// Connect to/create session in database
async function connectToSession() {
    try {
        // Check if active session exists
        const { data: existingSessions, error: checkError } = await supabaseClient
            .from('sessions')
            .select('*')
            .eq('is_active', true)
            .limit(1);
        
        if (checkError) throw checkError;
        
        if (existingSessions.length === 0) {
            if (appState.isHost) {
                // Host creates a new session
                const { data: newSession, error: sessionError } = await supabaseClient
                    .from('sessions')
                    .insert([
                        {
                            session_id: appState.sessionId,
                            host_id: appState.userId,
                            host_name: appState.userName,
                            is_active: true,
                            created_at: new Date().toISOString()
                        }
                    ])
                    .select()
                    .single();
                
                if (sessionError) throw sessionError;
                return true;
            } else {
                // Guest cannot create session
                alert("No active session found. Please ask the Host to create a session first.");
                return false;
            }
        } else {
            // Join existing session
            const session = existingSessions[0];
            
            // Check if session already has 2 users
            if (session.guest_id && session.guest_id !== appState.userId) {
                alert("Session is full. Only 2 users can connect at a time.");
                return false;
            }
            
            // Update session with guest info
            if (!appState.isHost) {
                const { error: updateError } = await supabaseClient
                    .from('sessions')
                    .update({
                        guest_id: appState.userId,
                        guest_name: appState.userName,
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
        console.error("Error connecting to session:", error);
        return false;
    }
}

// Restore user session
async function restoreUserSession(user) {
    try {
        // Find active session for this user
        const { data: sessions, error } = await supabaseClient
            .from('sessions')
            .select('*')
            .or(`host_id.eq.${user.id},guest_id.eq.${user.id}`)
            .eq('is_active', true)
            .limit(1);
        
        if (error || !sessions || sessions.length === 0) {
            // No active session, show connection modal
            if (connectionModal) connectionModal.style.display = 'flex';
            return;
        }
        
        const session = sessions[0];
        appState.sessionId = session.session_id;
        appState.isHost = session.host_id === user.id;
        appState.userName = appState.isHost ? "Host" : "Guest";
        appState.userEmail = user.email;
        appState.userId = user.id;
        appState.otherUserName = appState.isHost ? 
            (session.guest_name || "Guest") : 
            session.host_name;
        appState.isConnected = true;
        
        if (connectionModal) connectionModal.style.display = 'none';
        updateUIAfterConnection();
        loadChatHistory();
        loadCurrentImage();
        
        setupRealtimeSubscription();
        setupImageSubscription();
        
        if (appState.isHost && adminPanel) {
            adminPanel.style.display = 'block';
            refreshAdminInfo();
        }
    } catch (error) {
        console.error("Error restoring session:", error);
        if (connectionModal) connectionModal.style.display = 'flex';
    }
}

// Update UI after connection
function updateUIAfterConnection() {
    if (statusIndicator) statusIndicator.classList.remove('offline');
    if (userRoleDisplay) userRoleDisplay.textContent = `${appState.userName} (Connected)`;
    if (currentUserSpan) currentUserSpan.textContent = appState.userName;
    
    // Show logout button
    if (logoutBtn) logoutBtn.style.display = 'flex';
    
    // Enable chat controls
    if (messageInput) {
        messageInput.disabled = false;
        messageInput.focus();
    }
    if (sendMessageBtn) sendMessageBtn.disabled = false;
    
    // Enable image controls
    if (uploadImageBtn) uploadImageBtn.disabled = false;
    if (imageUrlInput) imageUrlInput.disabled = false;
}

// Handle logout
async function handleLogout() {
    if (confirm("Are you sure you want to logout?")) {
        // Sign out from Supabase Auth
        await supabaseClient.auth.signOut();
        
        // Update session in database
        if (appState.isConnected && appState.sessionId) {
            try {
                if (appState.isHost) {
                    // Host leaves - end the session
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
                    // Guest leaves - remove guest from session
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
        if (statusIndicator) statusIndicator.classList.add('offline');
        if (userRoleDisplay) userRoleDisplay.textContent = "Disconnected";
        if (currentUserSpan) currentUserSpan.textContent = "Guest";
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (messageInput) messageInput.disabled = true;
        if (sendMessageBtn) sendMessageBtn.disabled = true;
        if (uploadImageBtn) uploadImageBtn.disabled = true;
        if (imageUrlInput) imageUrlInput.disabled = true;
        if (downloadImageBtn) downloadImageBtn.disabled = true;
        if (adminPanel) adminPanel.style.display = 'none';
        
        // Clear chat and image
        if (chatMessages) {
            chatMessages.innerHTML = '<div class="message received"><div class="message-sender">System</div><div>Welcome to WriteToMe! This is a secure chat room for two people only.</div><div class="message-time">Just now</div></div>';
        }
        clearImage();
        
        // Show connection modal
        if (connectionModal) connectionModal.style.display = 'flex';
        
        // Reset login form
        if (userSelect) {
            userSelect.value = 'host';
            updateEmailBasedOnRole();
        }
        if (passwordInput) passwordInput.value = '';
        if (passwordError) passwordError.style.display = 'none';
        if (connectionError) connectionError.style.display = 'none';
    }
}

// Setup real-time subscription for messages
function setupRealtimeSubscription() {
    console.log('🔄 Setting up real-time subscription for session:', appState.sessionId);
    
    // Remove existing subscription if any
    if (appState.realtimeSubscription) {
        console.log('🗑️ Removing old subscription');
        supabaseClient.removeChannel(appState.realtimeSubscription);
    }
    
    // Create new subscription
    appState.realtimeSubscription = supabaseClient
        .channel('messages-channel-' + appState.sessionId)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: 'session_id=eq.' + appState.sessionId
            },
            (payload) => {
                console.log('📨 REAL-TIME EVENT RECEIVED:', payload);
                
                // Don't show the user's own messages
                if (payload.new.sender_id !== appState.userId) {
                    console.log('✅ Displaying message from other user');
                    displayMessage({
                        id: payload.new.id,
                        sender: payload.new.sender_name,
                        text: payload.new.message,
                        time: new Date(payload.new.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
                        type: 'received'
                    });
                } else {
                    console.log('⏩ Skipping own message');
                }
            }
        )
        .subscribe((status) => {
            console.log('📡 Subscription status:', status);
        });
}

// Setup real-time subscription for images
function setupImageSubscription() {
    console.log('🖼️ Setting up image subscription');
    
    supabaseClient
        .channel('images-channel-' + appState.sessionId)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'sessions',
                filter: 'session_id=eq.' + appState.sessionId
            },
            (payload) => {
                console.log('🖼️ Image update received:', payload);
                const updatedSession = payload.new;
                
                if (updatedSession.current_image && updatedSession.current_image !== appState.currentImage) {
                    console.log('✅ New image detected');
                    appState.currentImage = updatedSession.current_image;
                    displayImage(updatedSession.current_image);
                    if (downloadImageBtn) downloadImageBtn.disabled = false;
                    addSystemMessage(`${appState.otherUserName} shared an image.`);
                }
            }
        )
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
        
        // Clear current messages
        if (chatMessages) chatMessages.innerHTML = '';
        appState.messages = [];
        
        // Display each message
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
            if (downloadImageBtn) downloadImageBtn.disabled = false;
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
            .insert([
                {
                    session_id: appState.sessionId,
                    sender_id: appState.userId,
                    sender_name: senderName,
                    message: messageText,
                    created_at: new Date().toISOString()
                }
            ])
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
    if (!messageInput) return;
    
    const messageText = messageInput.value.trim();
    if (!messageText) return;
    
    // Create message object
    const message = {
        id: Date.now(),
        sender: appState.userName,
        text: messageText,
        time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        type: 'sent'
    };
    
    // Add to messages array
    appState.messages.push(message);
    
    // Display message immediately
    displayMessage(message);
    
    // Clear input
    messageInput.value = '';
    
    // Save to database
    await saveMessageToDB(appState.userName, messageText);
}

// Display a message in the chat
function displayMessage(message) {
    if (!chatMessages) return;
    
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
    if (!chatMessages) return;
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message received';
    
    messageDiv.innerHTML = `
        <div class="message-sender">System</div>
        <div>${text}</div>
        <div class="message-time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
    `;
    
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Also save to database
    saveMessageToDB('System', text);
}

// Handle typing indicator
function handleTyping() {
    // Clear previous timeout
    if (appState.typingTimeout) {
        clearTimeout(appState.typingTimeout);
    }
}

// Clear chat history
async function clearChat() {
    if (confirm("Are you sure you want to clear all chat messages?")) {
        try {
            // Delete messages from database for this session
            const { error } = await supabaseClient
                .from('messages')
                .delete()
                .eq('session_id', appState.sessionId);
            
            if (error) throw error;
            
            // Clear local chat
            if (chatMessages) chatMessages.innerHTML = '';
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
    if (imagePlaceholder) {
        imagePlaceholder.style.borderColor = 'var(--border-color)';
        imagePlaceholder.style.backgroundColor = '';
    }
    
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
    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        alert("Image size should be less than 5MB.");
        return;
    }
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        appState.currentImage = e.target.result;
        displayImage(appState.currentImage);
        
        // Enable download button
        if (downloadImageBtn) downloadImageBtn.disabled = false;
        
        // Save image to database
        await saveImageToDB(appState.currentImage);
        
        // Add system message
        addSystemMessage(`${appState.userName} shared an image.`);
    };
    reader.readAsDataURL(file);
}

// Upload image from URL
async function uploadImageFromUrl() {
    if (!imageUrlInput) return;
    
    const url = imageUrlInput.value.trim();
    if (!url) return;
    
    // Simple URL validation
    if (!url.match(/\.(jpeg|jpg|gif|png|webp)$/)) {
        alert("Please enter a valid image URL (jpg, png, gif, webp).");
        return;
    }
    
    // Set image preview
    appState.currentImage = url;
    displayImage(url);
    
    // Enable download button
    if (downloadImageBtn) downloadImageBtn.disabled = false;
    
    // Save image to database
    await saveImageToDB(url);
    
    // Add system message
    addSystemMessage(`${appState.userName} shared an image from URL.`);
    
    // Clear URL input
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
    if (!imagePreview || !imagePlaceholder) return;
    
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
            // Clear image in database
            const { error } = await supabaseClient
                .from('sessions')
                .update({ current_image: null })
                .eq('session_id', appState.sessionId);
            
            if (error) throw error;
            
            // Clear local state
            appState.currentImage = null;
            if (imagePreview) imagePreview.style.display = 'none';
            if (imagePlaceholder) imagePlaceholder.style.display = 'flex';
            if (downloadImageBtn) downloadImageBtn.disabled = true;
            
            // Add system message
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
    if (adminContent) adminContent.classList.toggle('show', appState.adminVisible);
    
    if (adminToggle) {
        const chevron = adminToggle.querySelector('i.fa-chevron-down');
        if (chevron) {
            if (appState.adminVisible) {
                chevron.className = 'fas fa-chevron-up';
            } else {
                chevron.className = 'fas fa-chevron-down';
            }
        }
    }
}

// Refresh admin information
async function refreshAdminInfo() {
    if (!appState.isHost || !adminInfo) return;
    
    try {
        // Get session info from database
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
        
        // Get message count
        const { count: messageCount } = await supabaseClient
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', appState.sessionId);
        
        adminInfo.innerHTML = `
            <div class="info-card">
                <h4><i class="fas fa-user"></i> Host Information</h4>
                <p><strong>Name:</strong> ${session.host_name}</p>
                <p><strong>ID:</strong> ${session.host_id.substring(0, 15)}...</p>
                <p><strong>Session Started:</strong> ${new Date(session.created_at).toLocaleTimeString()}</p>
                <p><strong>Duration:</strong> ${minutes}m ${seconds}s</p>
            </div>
            <div class="info-card">
                <h4><i class="fas fa-user-friends"></i> Guest Information</h4>
                <p><strong>Name:</strong> ${session.guest_name || 'Not connected'}</p>
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
        if (adminInfo) {
            adminInfo.innerHTML = `<div class="info-card"><p>Error loading admin information.</p></div>`;
        }
    }
}

// Initialize the app when page loads
document.addEventListener('DOMContentLoaded', initApp);
