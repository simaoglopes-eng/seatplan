"""Database-side logic of the restaurants vertical, shared by three routers.

The routers (restaurants.py, bookings.py, staff.py) stay thin: they check the
request, call one function from here, and return its answer. See
READ_ME_FIRST.md in this folder for the reading order.
"""
