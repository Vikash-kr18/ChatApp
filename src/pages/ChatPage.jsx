import { useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";

function ChatPage() {
  const connectionRef = useRef(null);
  const registeredRef = useRef(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // ✅ USER INIT
  const [user] = useState(() => {
    const stored = sessionStorage.getItem("chatUser");

    if (stored) return stored;

    const name = prompt("Enter your name") || "Guest";

    sessionStorage.setItem("chatUser", name);

    return name;
  });

  const [selectedUser, setSelectedUser] = useState(null);
  const [message, setMessage] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  const [onlineUsers, setOnlineUsers] = useState([]);
  const [chatMessages, setChatMessages] = useState({});
  const [typingUser, setTypingUser] = useState("");

  // ✅ AVATAR
  const getAvatar = (name) => {
    return name?.charAt(0)?.toUpperCase();
  };

  // ✅ SIGNALR
  useEffect(() => {
    if (!user) return;
    if (connectionRef.current) return;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl("http://192.168.2.208:7019/chatHub")
      .withAutomaticReconnect()
      .build();

    connectionRef.current = connection;

    // ✅ ONLINE USERS
    connection.on("OnlineUsers", (users) => {
      setOnlineUsers(users);
    });

    // ✅ RECEIVE MESSAGE
    connection.on("ReceiveMessage", async (fromUser, msg, messageId) => {

      setChatMessages(prev => ({
        ...prev,
        [fromUser]: [
          ...(prev[fromUser] || []),
          {
            id: messageId,
            user: fromUser,
            msg,
            time: new Date().toLocaleTimeString()
          }
        ]
      }));

      // ✅ DELIVERED ACK
      if (connection.state === "Connected") {
        await connection.invoke(
          "MessageDelivered",
          fromUser,
          user,
          messageId
        );
      }
    });

    // ✅ TYPING
    connection.on("UserTyping", (fromUser) => {
      setTypingUser(fromUser);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      typingTimeoutRef.current = setTimeout(() => {
        setTypingUser("");
      }, 1500);
    });

    // ✅ DELIVERED
    connection.on("MessageDelivered", (messageId) => {

      setChatMessages(prev => {
        const updated = { ...prev };

        Object.keys(updated).forEach(u => {

          updated[u] = updated[u].map(m =>
            m.id === messageId
              ? { ...m, status: "delivered" }
              : m
          );

        });

        return updated;
      });

    });

    // ✅ SEEN
    connection.on("MessageSeen", (messageId) => {

      setChatMessages(prev => {
        const updated = { ...prev };

        Object.keys(updated).forEach(u => {

          updated[u] = updated[u].map(m =>
            m.id === messageId
              ? { ...m, status: "seen" }
              : m
          );

        });

        return updated;
      });

    });

    // ✅ START CONNECTION
    const start = async () => {
      try {

        await connection.start();

        setIsConnected(true);

        if (!registeredRef.current) {

          registeredRef.current = true;

          await connection.invoke(
            "RegisterUser",
            user
          );
        }

      } catch (err) {
        console.error(err);
      }
    };

    start();

    // ✅ CLEANUP
    return () => {
      connection.stop();
      connectionRef.current = null;
      registeredRef.current = false;
    };

  }, [user]);

  // ✅ AUTO SCROLL
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth"
    });
  }, [chatMessages, selectedUser]);

  // ✅ SEND SEEN
  useEffect(() => {

    const connection = connectionRef.current;

    if (!connection || !selectedUser) return;

    const msgs = chatMessages[selectedUser] || [];

    msgs.forEach(m => {

      if (m.user !== user && !m.status) {

        connection.invoke(
          "MessageSeen",
          selectedUser,
          user,
          m.id
        );

      }

    });

  }, [selectedUser]);

  // ✅ TYPING
  const handleTyping = async (e) => {

    setMessage(e.target.value);

    const connection = connectionRef.current;

    if (
      connection &&
      selectedUser &&
      connection.state === "Connected"
    ) {

      await connection.invoke(
        "Typing",
        selectedUser,
        user
      );
    }
  };

  // ✅ SEND MESSAGE
  const sendMessage = async () => {

    const connection = connectionRef.current;

    if (
      !connection ||
      !selectedUser ||
      message.trim() === ""
    ) return;

    const msgId = Date.now().toString();

    // ✅ ADD TO UI
    setChatMessages(prev => ({
      ...prev,
      [selectedUser]: [
        ...(prev[selectedUser] || []),
        {
          id: msgId,
          user,
          msg: message,
          time: new Date().toLocaleTimeString(),
          status: "sent"
        }
      ]
    }));

    // ✅ SEND TO SERVER
    if (connection.state === "Connected") {

      await connection.invoke(
        "SendPrivateMessage",
        selectedUser,
        message,
        user,
        msgId
      );
    }

    setMessage("");
  };

  const currentChat =
    selectedUser
      ? chatMessages[selectedUser] || []
      : [];

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#0f172a",
        color: "white",
        fontFamily: "Segoe UI"
      }}
    >

      {/* LEFT PANEL */}
      <div
        style={{
          width: "30%",
          borderRight: "1px solid #1e293b",
          background: "#111827",
          display: "flex",
          flexDirection: "column"
        }}
      >

        {/* HEADER */}
        <div
          style={{
            padding: "20px",
            borderBottom: "1px solid #1e293b",
            fontSize: "22px",
            fontWeight: "bold"
          }}
        >
          Chats
        </div>

        {/* STATUS */}
        <div
          style={{
            padding: "10px 20px",
            color: isConnected
              ? "#22c55e"
              : "#ef4444",
            fontSize: "14px"
          }}
        >
          {isConnected
            ? "● Connected"
            : "● Disconnected"}
        </div>

        {/* USERS */}
        <div
          style={{
            flex: 1,
            overflowY: "auto"
          }}
        >

          {onlineUsers
            .filter(u => u !== user)
            .map((u, i) => {

              const lastMsg =
                (chatMessages[u] || [])
                  .slice(-1)[0]?.msg || "";

              return (
                <div
                  key={i}
                  onClick={() => setSelectedUser(u)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "15px 20px",
                    cursor: "pointer",
                    background:
                      selectedUser === u
                        ? "#1e293b"
                        : "transparent",
                    borderBottom:
                      "1px solid #1e293b"
                  }}
                >

                  {/* AVATAR */}
                  <div
                    style={{
                      width: "45px",
                      height: "45px",
                      borderRadius: "50%",
                      background: "#3b82f6",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: "bold",
                      fontSize: "18px"
                    }}
                  >
                    {getAvatar(u)}
                  </div>

                  {/* USER INFO */}
                  <div style={{ flex: 1 }}>

                    <div
                      style={{
                        fontWeight: "600"
                      }}
                    >
                      {u}
                    </div>

                    <div
                      style={{
                        fontSize: "12px",
                        color: "#94a3b8",
                        marginTop: "3px"
                      }}
                    >
                      {lastMsg}
                    </div>

                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div
        style={{
          width: "70%",
          display: "flex",
          flexDirection: "column",
          background: "#0f172a"
        }}
      >

        {selectedUser ? (
          <>

            {/* HEADER */}
            <div
              style={{
                padding: "15px 20px",
                borderBottom: "1px solid #1e293b",
                display: "flex",
                alignItems: "center",
                gap: "12px"
              }}
            >

              {/* AVATAR */}
              <div
                style={{
                  width: "45px",
                  height: "45px",
                  borderRadius: "50%",
                  background: "#3b82f6",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: "bold"
                }}
              >
                {getAvatar(selectedUser)}
              </div>

              <div>

                <div
                  style={{
                    fontWeight: "bold"
                  }}
                >
                  {selectedUser}
                </div>

                <div
                  style={{
                    fontSize: "12px",
                    color: "#94a3b8"
                  }}
                >
                  online
                </div>

              </div>
            </div>

            {/* TYPING */}
            {typingUser === selectedUser && (
              <div
                style={{
                  paddingLeft: "20px",
                  fontSize: "12px",
                  color: "#94a3b8",
                  marginTop: "5px"
                }}
              >
                typing...
              </div>
            )}

            {/* CHAT AREA */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px"
              }}
            >

              {currentChat.map((m, i) => {

                const isMe = m.user === user;

                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      justifyContent: isMe
                        ? "flex-end"
                        : "flex-start",
                      marginBottom: "12px"
                    }}
                  >

                    <div
                      style={{
                        maxWidth: "60%",
                        padding: "12px 15px",
                        borderRadius: "12px",
                        background: isMe
                          ? "#2563eb"
                          : "#1e293b",
                        color: "white"
                      }}
                    >

                      <div>
                        {m.msg}
                      </div>

                      <div
                        style={{
                          fontSize: "10px",
                          marginTop: "5px",
                          textAlign: "right",
                          opacity: 0.7
                        }}
                      >
                        {m.time}{" "}

                        {isMe && (
                          m.status === "sent"
                            ? "✓"
                            : m.status === "delivered"
                            ? "✓✓"
                            : m.status === "seen"
                            ? "✓✓"
                            : ""
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}

              <div ref={messagesEndRef}></div>

            </div>

            {/* INPUT */}
            <div
              style={{
                padding: "15px",
                borderTop: "1px solid #1e293b",
                display: "flex",
                gap: "10px"
              }}
            >

              <input
  value={message}
  onChange={handleTyping}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      sendMessage();
    }
  }}
  placeholder="Type a message..."
                style={{
                  flex: 1,
                  padding: "14px",
                  borderRadius: "10px",
                  border: "none",
                  outline: "none",
                  background: "#1e293b",
                  color: "white",
                  fontSize: "14px"
                }}
              />

              <button
                onClick={sendMessage}
                style={{
                  padding: "0 25px",
                  borderRadius: "10px",
                  border: "none",
                  background: "#2563eb",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: "bold"
                }}
              >
                Send
              </button>

            </div>

          </>
        ) : (

          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#94a3b8",
              fontSize: "24px"
            }}
          >
            Select a chat
          </div>

        )}

      </div>
    </div>
  );
}

export default ChatPage;