// ============================================================
// SUPABASE CHAT APP - script.js
// ============================================================

// ---------- 1. SUPABASE CONNECTION ----------

const SUPABASE_URL = "https://emodmimajxgxvobhuftm.supabase.co";
const SUPABASE_KEY = "sb_publishable_GW5uePIrMQOg7wN8iQmg0Q_HeNLfbUK";

const sb = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


// ============================================================
// 2. GET HTML ELEMENTS
// ============================================================

const authScreen = document.getElementById("auth-screen");
const chatScreen = document.getElementById("chat-screen");

const authForm = document.getElementById("auth-form");
const authMessage = document.getElementById("auth-message");

const displayName = document.getElementById("display-name");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");

const signupBtn = document.getElementById("signup-btn");
const logoutBtn = document.getElementById("logout-btn");

const who = document.getElementById("who");

const messageList = document.getElementById("messages");
const messageForm = document.getElementById("message-form");
const messageInput = document.getElementById("message-input");


// ============================================================
// 3. APP VARIABLES
// ============================================================

let currentUser = null;
let channel = null;

// user id -> display name
const names = {};

// ids of messages already on screen (prevents duplicates)
const shownIds = new Set();


// ============================================================
// 4. SIGN UP
// ============================================================

async function signUp() {
  const name = displayName.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (name.length < 2 || name.length > 24) {
    authMessage.textContent =
      "Display name must be 2 to 24 characters.";
    return;
  }

  if (email === "" || password === "") {
    authMessage.textContent =
      "Please enter your email and password.";
    return;
  }

  authMessage.textContent =
    "Creating your account...";

  const result = await sb.auth.signUp({
    email: email,
    password: password,
    options: {
      data: {
        display_name: name
      }
    }
  });

  if (result.error) {
    authMessage.textContent =
      result.error.message;
    return;
  }

  if (!result.data.session) {
    authMessage.textContent =
      "Account created. Check your email to confirm your account.";
    return;
  }

  authMessage.textContent =
    "Account created successfully!";
}


// ============================================================
// 5. LOG IN
// ============================================================

async function logIn() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (email === "" || password === "") {
    authMessage.textContent =
      "Please enter your email and password.";
    return;
  }

  authMessage.textContent =
    "Logging in...";

  const result =
    await sb.auth.signInWithPassword({
      email: email,
      password: password
    });

  if (result.error) {
    authMessage.textContent =
      result.error.message;
    return;
  }

  authMessage.textContent =
    "";
}


// ============================================================
// 6. LOGIN FORM
// ============================================================

if (authForm) {
  authForm.addEventListener(
    "submit",
    function (event) {
      event.preventDefault();
      logIn();
    }
  );
}


// ============================================================
// 7. SIGNUP BUTTON
// ============================================================

if (signupBtn) {
  signupBtn.addEventListener(
    "click",
    function () {
      if (authForm && authForm.reportValidity()) {
        signUp();
      }
    }
  );
}


// ============================================================
// 8. LOGOUT
// ============================================================

if (logoutBtn) {
  logoutBtn.addEventListener(
    "click",
    async function () {
      const result =
        await sb.auth.signOut();

      if (result.error) {
        console.error(result.error);
      }
    }
  );
}


// ============================================================
// 9. AUTH STATE
// ============================================================

sb.auth.onAuthStateChange(
  function (event, session) {

    const user =
      session ? session.user : null;

    setTimeout(
      function () {

        if (
          user &&
          (
            !currentUser ||
            currentUser.id !== user.id
          )
        ) {
          startChat(user);
        }

        if (!user && currentUser) {
          stopChat();
        }

      },
      0
    );
  }
);


// ============================================================
// 10. SHOW / HIDE SCREENS
// ============================================================

function setVisible(element, visible) {
  if (!element) {
    return;
  }

  element.hidden = !visible;
  element.style.display = visible ? "" : "none";
}

function showScreen(loggedIn) {
  setVisible(authScreen, !loggedIn);
  setVisible(chatScreen, loggedIn);
}

// Show the login screen first until we know who the user is.
showScreen(false);


// ============================================================
// 11. START CHAT
// ============================================================

async function startChat(user) {
  // Set this first so a second auth event can't start the chat twice.
  currentUser = user;

  shownIds.clear();
  messageList.innerHTML = "";
  showScreen(true);

  await loadNames();
  if (!currentUser || currentUser.id !== user.id) {
    return;
  }

  who.textContent = names[user.id] || user.email;

  await loadMessages();
  if (!currentUser || currentUser.id !== user.id) {
    return;
  }

  subscribeToMessages();
}


// ============================================================
// 12. STOP CHAT
// ============================================================

function stopChat() {
  currentUser = null;

  if (channel) {
    sb.removeChannel(channel);
    channel = null;
  }

  shownIds.clear();
  messageList.innerHTML = "";

  for (const id in names) {
    delete names[id];
  }

  if (passwordInput) {
    passwordInput.value = "";
  }

  showScreen(false);
}


// ============================================================
// 13. NAMES (profiles)
// ============================================================

async function loadNames() {
  const result = await sb
    .from("profiles")
    .select("id, display_name");

  if (result.error) {
    console.error("Could not load profiles:", result.error);
    return;
  }

  result.data.forEach(function (profile) {
    names[profile.id] = profile.display_name;
  });
}

async function getName(userId) {
  if (names[userId]) {
    return names[userId];
  }

  const result = await sb
    .from("profiles")
    .select("id, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (result.error) {
    console.error("Could not load profile:", result.error);
    return "Unknown";
  }

  if (result.data) {
    names[userId] = result.data.display_name;
    return result.data.display_name;
  }

  return "Unknown";
}


// ============================================================
// 14. LOAD MESSAGES (latest 100, oldest first)
// ============================================================

async function loadMessages() {
  const result = await sb
    .from("messages")
    .select("id, user_id, content, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (result.error) {
    console.error("Could not load messages:", result.error);
    return;
  }

  result.data.reverse().forEach(addMessage);
}


// ============================================================
// 15. SHOW ONE MESSAGE ON SCREEN
// ============================================================

function addMessage(msg) {
  if (shownIds.has(msg.id)) {
    return;
  }

  shownIds.add(msg.id);

  const mine = currentUser && msg.user_id === currentUser.id;

  const tag =
    messageList.tagName === "UL" || messageList.tagName === "OL"
      ? "li"
      : "div";

  const item = document.createElement(tag);
  item.className = mine ? "message mine" : "message";
  item.dataset.id = msg.id;

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const nameEl = document.createElement("strong");
  nameEl.textContent = names[msg.user_id] || "Unknown";

  const timeEl = document.createElement("span");
  timeEl.textContent =
    " " +
    new Date(msg.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    });

  meta.append(nameEl, timeEl);

  // textContent (not innerHTML) so messages can never inject HTML.
  const text = document.createElement("div");
  text.className = "message-text";
  text.textContent = msg.content;

  item.append(meta, text);

  if (mine) {
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "Delete";

    deleteBtn.addEventListener("click", function () {
      deleteMessage(msg.id);
    });

    item.append(deleteBtn);
  }

  messageList.append(item);
  messageList.scrollTop = messageList.scrollHeight;
}

function removeMessage(id) {
  shownIds.delete(id);

  const item = messageList.querySelector(
    '[data-id="' + id + '"]'
  );

  if (item) {
    item.remove();
  }
}


// ============================================================
// 16. SEND A MESSAGE
// ============================================================

if (messageForm) {
  messageForm.addEventListener(
    "submit",
    async function (event) {
      event.preventDefault();

      if (!currentUser) {
        return;
      }

      const content = messageInput.value.trim();

      if (content === "" || content.length > 500) {
        return;
      }

      messageInput.value = "";

      // user_id is filled in by the database from the login token.
      const result = await sb
        .from("messages")
        .insert({ content: content })
        .select("id, user_id, content, created_at")
        .single();

      if (result.error) {
        console.error("Could not send:", result.error);
        messageInput.value = content;
        alert("Message could not be sent: " + result.error.message);
        return;
      }

      addMessage(result.data);
    }
  );
}


// ============================================================
// 17. DELETE A MESSAGE
// ============================================================

async function deleteMessage(id) {
  const result = await sb
    .from("messages")
    .delete()
    .eq("id", id);

  if (result.error) {
    console.error("Could not delete:", result.error);
    alert("Message could not be deleted: " + result.error.message);
    return;
  }

  removeMessage(id);
}


// ============================================================
// 18. REALTIME: NEW AND DELETED MESSAGES
// ============================================================

function subscribeToMessages() {
  if (channel) {
    sb.removeChannel(channel);
  }

  channel = sb
    .channel("messages-feed")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages" },
      async function (payload) {
        const msg = payload.new;

        await getName(msg.user_id);

        if (!currentUser) {
          return;
        }

        addMessage(msg);
      }
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "messages" },
      function (payload) {
        removeMessage(payload.old.id);
      }
    )
    .subscribe(function (status) {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("Realtime problem:", status);
      }
    });
}
