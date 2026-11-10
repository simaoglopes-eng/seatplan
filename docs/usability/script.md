# Facilitator script

Read the parts in quotation marks aloud. Everything else is for you.

## 1. Welcome (2 minutes)

"Thank you for helping us. We are students testing a website called SeatPlan.
We are testing the website, not you. If something is hard, that is useful for
us. Please think aloud: say what you are looking at, what you expect, and what
confuses you. I will not help much, because we want to see what happens when
nobody is there to explain. You can stop at any time."

Then go through `consent.md` together and get it signed.

## 2. Warm-up questions (2 minutes)

- "When did you last book a table at a restaurant? How did you do it?"
- "Have you ever been to a wedding or a conference with a seating plan? How
  did you find your seat?"

## 3. Tasks

Give one task at a time on a printed card. Start the timer when the tester
has read the card. Stop it when they say "done" or reach the success screen.

Each task lists its starting link (from the home page demo list, after a
demo reset), the success condition, and what to watch. The success screens
and button names come from the code in `frontend/src/pages/`.

### Persona 1: Rita, wedding guest (phone)

Start: the "Wedding Guest Choosing" link.

| # | Task card | Success when | Watch for |
|---|---|---|---|
| R1 | "You are invited to Ana and Bruno's wedding. Tell them you are coming." | The tester presses "Yes, I will be there" | Do they read the event details first? |
| R2 | "Say that you know two other guests." Pick any two names. | Two people saved, or the tester skips on purpose and can say why | Do they understand that names are shortened? Do they find the search? |
| R3 | "Choose a seat near the people you know and make it yours." | The done screen says "You are all set" | Do they press "Confirm this seat" after the hold, or think holding is enough? |
| R4 | "You changed your mind. Make sure other guests do not see your name." | The anonymous switch is on | Can they find it after the seat is confirmed? |

### Persona 2: Joana, wedding planner (laptop)

Start: the "Wedding Organiser" link, already signed in.

| # | Task card | Success when | Watch for |
|---|---|---|---|
| J1 | "How many guests still have no seat?" | The tester says the number shown on the page | Do they use the header or the filter? |
| J2 | "Add a new guest called Pedro Example, pedro@example.com, and copy his personal link." | Guest added and "Copy link" pressed | Do they understand the link is shown only once? |
| J3 | "Let SeatPlan fill all the empty seats." | "Apply this plan" pressed after a preview | Do they think "Preview auto-fill" already changed the plan? |
| J4 | "Oops. Go back to how it was before." | Undo pressed and the plan is back | Can they find Undo? |
| J5 | "Print the place cards." | The Print tab is open and the place cards print button is pressed | Do they look for printing in the right tab? |

### Persona 3: Tiago, diner (phone)

Start: the "Restaurant Booking" link.

| # | Task card | Success when | Watch for |
|---|---|---|---|
| T1 | "Book a table for 4 people at Casa Lumen for this Friday evening, by the window if you can." (If Friday is closed, the tester should notice and pick another day.) | The confirmation page "You are booked" is shown | Do they notice the hold countdown? Do they use the map, the list or "Choose for me"? |
| T2 | "Save the link that lets you change this booking." | The tester presses Copy, or explains where the link is | Do they understand why the link matters? |
| T3 | "Using that link, change the booking to 5 people." | The change is saved | Is "Save changes" being disabled at first confusing? |
| T4 | "Cancel the booking." | The page shows the booking as cancelled | Do they read the dialog, or press the first button? |
| T5 | "Try to book at a time that is full." (Only if a full time exists after the reset; skip otherwise and write "skipped".) | The waitlist answer with a queue position is shown | Do they understand "Full, join waitlist"? |

### Persona 4: Marta, restaurant host (laptop or tablet)

Start: the "Restaurant Staff" link, already signed in.

| # | Task card | Success when | Watch for |
|---|---|---|---|
| M1 | "How many tables are free right now?" | The tester says the number shown | Do they read the counts or count on the map? |
| M2 | "A party of 3 just walked in. Seat them." | A walk-in is seated at the suggested table | Do they read the reasons? Number of taps |
| M3 | "Before you answer a phone call: if a party of 6 came at 21:00, where would they go?" | The what-if answer is shown | Do they worry that it changes the floor? |
| M4 | "Move one of the coming bookings to another free table." | The booking is moved | Drag, tap-to-move or the dialog? |
| M5 | "What was the no-show rate on the dashboard?" | The tester reads the number and says how many bookings it is based on | Do they see the sample size? |

## 4. After the tasks (8 minutes)

1. Give the SUS questionnaire (`sus.md`) on paper. Do not comment while they
   fill it in.
2. Ask:
   - "What was the hardest moment?"
   - "Was there anything you expected to find and did not?"
   - "Would you use this instead of what you use today? Why or why not?"
3. "Thank you. That was very useful."

## 5. Straight after the session (5 minutes, without the tester)

The note-taker and the facilitator compare notes and agree on success, time
and errors for each task on the observer sheets. Then the results go into
`results-template.md`.
