import React from 'react';
import DesktopTerminal from './components/DesktopTerminal';

const App: React.FC = () => {
  return (
    <div className="app-container">
      <DesktopTerminal />
      <style jsx>{`
        .app-container {
          width: 100%;
          height: 100vh;
          background: #0f0f0f;
          overflow: hidden;
        }
      `}</style>
    </div>
  );
};

export default App;