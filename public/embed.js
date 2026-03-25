(function() {
  // Prevent multiple injections
  if (document.getElementById('exie-chat-widget-iframe')) return;

  const iframe = document.createElement('iframe');
  iframe.id = 'exie-chat-widget-iframe';
  // Use the current domain if available, otherwise fallback to the known URL
  const scriptTag = document.currentScript;
  const scriptUrl = scriptTag ? new URL(scriptTag.src) : { origin: "https://exie-ai-virtual-support-agent-481133724557.europe-west1.run.app" };
  const origin = scriptUrl.origin;
  
  iframe.src = origin + "/";
  
  // Default styles for the iframe (closed state)
  const closedStyles = {
    position: 'fixed',
    bottom: '0',
    right: '0',
    width: '350px',
    height: '300px', // Enough for the button and prompts
    border: 'none',
    zIndex: '2147483647',
    background: 'transparent',
    transition: 'height 0.3s ease, width 0.3s ease',
    colorScheme: 'normal'
  };

  // Styles when chat is open
  const openStyles = {
    width: '450px',
    height: '750px'
  };

  // Styles when chat is maximized
  const maximizedStyles = {
    width: '100vw',
    height: '100vh'
  };

  // Apply initial styles
  Object.assign(iframe.style, closedStyles);
  
  // Add to body
  document.body.appendChild(iframe);

  // Listen for messages from the iframe
  window.addEventListener('message', function(event) {
    // Make sure the message is coming from our widget
    if (event.origin !== origin) return;
    
    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      
      if (data.type === 'exie-chat-opened') {
        Object.assign(iframe.style, openStyles);
      } else if (data.type === 'exie-chat-closed') {
        Object.assign(iframe.style, closedStyles);
      } else if (data.type === 'exie-chat-maximized') {
        Object.assign(iframe.style, maximizedStyles);
      } else if (data.type === 'exie-chat-unmaximized') {
        Object.assign(iframe.style, openStyles);
      }
    } catch (e) {
      // Ignore parsing errors from other messages
    }
  });
})();
