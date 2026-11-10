// The complete route table. Every screen of SeatPlan is listed here once,
// so feature owners fill in their page file and never need to touch this one.
import { Route, Routes } from "react-router-dom";
import EditorPage from "./pages/editor/EditorPage";
import AttendeePage from "./pages/events/AttendeePage";
import OrganiserPage from "./pages/events/OrganiserPage";
import Home from "./pages/Home";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import BookingPage from "./pages/restaurant/BookingPage";
import ManageBookingPage from "./pages/restaurant/ManageBookingPage";
import StaffPage from "./pages/restaurant/StaffPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      {/* Events: personal attendee link, organiser workspace */}
      <Route path="/e/:token" element={<AttendeePage />} />
      <Route path="/organiser/:eventId" element={<OrganiserPage />} />
      {/* Restaurants: public booking, manage-or-cancel link, staff floor */}
      <Route path="/r/:venueId" element={<BookingPage />} />
      <Route path="/b/:token" element={<ManageBookingPage />} />
      <Route path="/staff/:venueId" element={<StaffPage />} />
      {/* Shared: floor-plan editor for both kinds of venue */}
      <Route path="/editor/:venueId" element={<EditorPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
