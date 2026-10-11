import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { QrCode, ConciergeBell } from 'lucide-react';
import GuestApp from './guest/GuestApp.jsx';
import DeskApp from './desk/DeskApp.jsx';
import Toaster from './components/Toaster.jsx';
import { isNativeApp } from './lib/native.js';

// /guest/?room=<token>  -> guest app (opened from the room QR code)
// /desk                 -> staff screens
// The Android app is the staff app, so it opens straight at /desk.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/guest/*" element={<GuestApp />} />
        <Route path="/desk/*" element={<DeskApp />} />
        <Route path="*" element={isNativeApp() ? <Navigate to="/desk" replace /> : <Landing />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}

function Landing() {
  return (
    <div className="center-screen">
      <div className="card auth-card">
        <div className="brand brand-lg">Anemos</div>
        <p className="eyebrow">Boutique living &amp; spa</p>
        <div className="landing-row">
          <QrCode size={22} />
          <p>Guests: scan the QR code in your room to open the concierge.</p>
        </div>
        <Link to="/desk" className="btn btn-primary btn-block">
          <ConciergeBell size={18} /> Staff login
        </Link>
      </div>
    </div>
  );
}
