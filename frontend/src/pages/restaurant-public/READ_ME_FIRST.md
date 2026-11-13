# restaurant-public: read me first

`/restaurants/:slug`: the public page of a restaurant (spec 9.2). Loaded from `GET /api/restaurants/{slug}`.

- `RestaurantPage.tsx` draws the gallery, name, cuisines, price, address, highlights, description, weekly hours,
  closed days, a small map, "Open in Google Maps", phone / website / Instagram, and "Book a table".
- "Book a table" embeds `BookingEmbed` (from `pages/restaurant/BookingPage.tsx`), which loads `GET /api/r/{public_id}`
  and runs the same booking flow as before. A link with `?date=&time=&party=` starts the flow filled in:
  `restaurant/useLinkedTime.ts` checks once that the time is still free and goes straight to the tables, or lands on
  the list of times with "... is not free any more".
- The owner sees an unpublished restaurant with a Preview banner and no booking form. Everyone else gets "We cannot find this restaurant".
- `/r/:venueId` forwards here (keeping the query) when the restaurant has a slug; `GET /api/r/{id}` now carries `slug`.
- `Gallery.tsx`: cover first, thumbnails, full-screen view with arrows, swipe and Esc (through `Dialog`).
- `scheduleText.ts` and `pageModel.ts` are pure and unit tested. Only http/https websites become links.
