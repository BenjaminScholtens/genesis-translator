import { useState, useEffect } from "react";
import {
  VSCodeButton,
  VSCodeTextField,
} from "@vscode/webview-ui-toolkit/react";
import "./App.css";
import { ChatMessage } from "../../types";
const vscode = acquireVsCodeApi();

function App() {
  const [message, setMessage] = useState<ChatMessage>({ value: "" });
  const [messageLog, setMessageLog] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      console.log({ message });
      switch (message.command) {
        case "setState": {
          const state = message.data;
          console.log({ state });
          break;
        }
        // Handle other cases
      }
    };

    window.addEventListener("message", handleMessage);

    // Cleanup function to remove the event listener
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, []); // The empty array means this effect runs once on mount and cleanup on unmount

  function handleHowdyClick() {
    setMessageLog([...messageLog, { value: message?.value }]);
    vscode.postMessage({
      command: "sendMessage",
      message: message, // Use the state variable here
    });
    setMessage({ value: "" });
  }
  // console.log("getState", vscode.getState());
  window.addEventListener(
    "message",
    (
      event: MessageEvent<{
        value: { message: ChatMessage };
        type: string;
      }>,
    ) => {
      // const message = event.data; // The JSON data our extension sent
      console.log({ event });
      setMessageLog([
        ...messageLog,
        { value: event.data.value.message?.value },
      ]);
      // switch (message.command) {
      //   case "setState": {
      //     // Handle the 'setState' message and update webview state
      //     const state = message.data;
      //     console.log({ state });
      //     // Use the state to update your webview content
      //     break;
      //   }
      // }
    },
  );
  return (
    <main style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <h1>Chat Window</h1>
      <div className="chat-container" style={{ flex: 1, overflowY: "auto" }}>
        {/* Chat messages will be displayed here */}
        {/* This is a placeholder for chat content */}
        <div className="chat-content">
          {messageLog.map((message, index) => (
            <p key={index}>{message.value}</p>
          ))}
        </div>
      </div>
      {/* Input for sending messages */}
      <div
        className="chat-input"
        style={{ position: "sticky", bottom: 0, backgroundColor: "white" }}
      >
        <VSCodeTextField
          placeholder="Type a message..."
          value={message.value} // Set the value of the input field to the state variable
          onChange={(e) =>
            setMessage({ value: (e.target as HTMLInputElement).value })
          }
        />
        <VSCodeButton onClick={() => handleHowdyClick()}>Send</VSCodeButton>
      </div>
    </main>
  );
}

export default App;
