// ========================================================
// SKYWINGS AIRLINE RESERVATION SYSTEM - ADVANCED DBMS SCRIPT
// Technology: Vanilla JavaScript + Fetch API + Real MySQL (port 5050)
// Complete DBMS Features: ACID Transactions, Seats, Payments,
// Refunds, Waitlist, Notifications, Admin Portal, Charts, E-Tickets
// ========================================================

const API_BASE = window.location.protocol.startsWith("http")
    ? `${window.location.origin}/api`
    : "http://localhost:5050/api";

// Application State
let currentUser = null;
let currentSort = "cheapest";
let selectedFlight = null;
let selectedClass = "Economy";
let selectedPassengersCount = 1;
let currentSearchSource = "Pune";
let currentSearchDestination = "Delhi";
let currentPassengersData = [];
let selectedSeats = [];
let selectedPaymentMethod = "Credit Card";
let userBookingsCache = [];
let currentAdminTab = "flights";
let routeChartInstance = null;
let occupancyChartInstance = null;

// ========================================================
// ON PAGE LOAD & SESSION RESTORATION
// ========================================================
document.addEventListener("DOMContentLoaded", () => {
    // Restore session if user was logged in
    const storedUser = sessionStorage.getItem("airline_user");
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            updateNavAuthUI();
        } catch (e) {
            sessionStorage.removeItem("airline_user");
        }
    }

    // Set today's date on datepickers
    const today = new Date().toISOString().split("T")[0];
    const depDateInput = document.getElementById("search-dep-date");
    if (depDateInput) {
        depDateInput.min = today;
        depDateInput.value = today;
    }

    loadCities();
    checkUpcomingTrip();
    if (currentUser) {
        loadNotificationBadge();
    }
});

// ========================================================
// 1. NAVIGATION & SECTIONS
// ========================================================
function showSection(sectionId) {
    const sections = ["home-section", "search-section", "pnr-section", "book-section", "bookings-section", "admin-section"];
    sections.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add("d-none");
    });

    const target = document.getElementById(sectionId);
    if (target) target.classList.remove("d-none");

    document.querySelectorAll(".nav-tab").forEach(t => t.classList.remove("active"));
    if (sectionId === "home-section") document.getElementById("nav-home")?.classList.add("active");
    if (sectionId === "search-section") document.getElementById("nav-search")?.classList.add("active");
    if (sectionId === "pnr-section") document.getElementById("nav-pnr")?.classList.add("active");
    if (sectionId === "bookings-section") {
        document.getElementById("nav-bookings")?.classList.add("active");
        loadUserBookings();
    }

    window.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollToJourney() {
    showSection("home-section");
    setTimeout(() => {
        document.getElementById("manage-journey")?.scrollIntoView({ behavior: "smooth" });
    }, 100);
}

// ========================================================
// 2. SEARCH WIDGET LOGIC
// ========================================================
function setTripType(type) {
    const btnOneWay = document.getElementById("btn-trip-oneway");
    const btnRound = document.getElementById("btn-trip-round");
    const returnDateInput = document.getElementById("search-ret-date");

    if (type === "oneway") {
        btnOneWay?.classList.add("active");
        btnRound?.classList.remove("active");
        if (returnDateInput) {
            returnDateInput.disabled = true;
            returnDateInput.value = "";
        }
    } else {
        btnRound?.classList.add("active");
        btnOneWay?.classList.remove("active");
        if (returnDateInput) {
            returnDateInput.disabled = false;
            const d = new Date();
            d.setDate(d.getDate() + 3);
            returnDateInput.value = d.toISOString().split("T")[0];
        }
    }
}

function swapCities() {
    const fromInput = document.getElementById("search-from");
    const toInput = document.getElementById("search-to");
    if (fromInput && toInput) {
        const temp = fromInput.value;
        fromInput.value = toInput.value;
        toInput.value = temp;
    }
}

function swapPageCities() {
    const fromInput = document.getElementById("flight-source");
    const toInput = document.getElementById("flight-dest");
    if (fromInput && toInput) {
        const temp = fromInput.value;
        fromInput.value = toInput.value;
        toInput.value = temp;
    }
}

function quickSelectRoute(source, destination) {
    document.getElementById("search-from").value = source;
    document.getElementById("search-to").value = destination;
    document.getElementById("flight-source").value = source;
    document.getElementById("flight-dest").value = destination;

    currentSearchSource = source;
    currentSearchDestination = destination;

    showSection("search-section");
    executeFlightSearch(source, destination);
}

function updatePassengerSummary() {
    const countSelect = document.getElementById("passenger-count");
    selectedPassengersCount = parseInt(countSelect?.value) || 1;
}

// Search from Homepage
function handleHeroSearch(e) {
    e.preventDefault();
    const source = document.getElementById("search-from").value.trim();
    const destination = document.getElementById("search-to").value.trim();
    const classSelect = document.getElementById("travel-class-select").value;
    const passCount = parseInt(document.getElementById("passenger-count").value) || 1;

    currentSearchSource = source;
    currentSearchDestination = destination;
    selectedClass = classSelect;
    selectedPassengersCount = passCount;

    document.getElementById("flight-source").value = source;
    document.getElementById("flight-dest").value = destination;
    document.getElementById("page-travel-class").value = classSelect;

    showSection("search-section");
    executeFlightSearch(source, destination);
}

// Search from Search Page
function handlePageSearch(e) {
    e.preventDefault();
    const source = document.getElementById("flight-source").value.trim();
    const destination = document.getElementById("flight-dest").value.trim();
    selectedClass = document.getElementById("page-travel-class").value;

    currentSearchSource = source;
    currentSearchDestination = destination;

    executeFlightSearch(source, destination);
}

function setFlightSort(sortType) {
    currentSort = sortType;
    document.querySelectorAll(".sort-btn").forEach(btn => btn.classList.remove("active"));
    const activeBtn = document.getElementById(`sort-${sortType}`);
    if (activeBtn) activeBtn.classList.add("active");

    executeFlightSearch(currentSearchSource, currentSearchDestination);
}

// ========================================================
// 3. FLIGHT LISTING & SEARCH FROM MYSQL
// ========================================================
async function loadCities() {
    try {
        const res = await fetch(`${API_BASE}/cities`);
        const data = await res.json();
        if (res.ok && data.success) {
            const datalist = document.getElementById("cities-list");
            if (datalist) {
                datalist.innerHTML = data.cities.map(c => `<option value="${c}">`).join("");
            }
        }
    } catch (err) {
        console.error("Cities error:", err);
    }
}

async function loadAllFlights() {
    const container = document.getElementById("flights-container");
    const countBadge = document.getElementById("flights-result-count");

    container.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary me-2"></div>
            <span class="text-muted">Loading all scheduled flights from MySQL...</span>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE}/flights`);
        const data = await res.json();

        if (res.ok && data.success) {
            countBadge.textContent = `${data.count} flights scheduled in database`;
            renderFlightCards(data.flights);
        } else {
            container.innerHTML = `<div class="alert alert-danger">${data.message}</div>`;
        }
    } catch (err) {
        container.innerHTML = `<div class="alert alert-danger">Error connecting to backend server on port 5050.</div>`;
    }
}

async function executeFlightSearch(source, destination) {
    const container = document.getElementById("flights-container");
    const countBadge = document.getElementById("flights-result-count");
    const airlineFilter = document.getElementById("filter-airline-select")?.value || "all";

    container.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary me-2"></div>
            <span class="text-muted">Searching available flights from ${source} to ${destination}...</span>
        </div>
    `;

    try {
        let url = `${API_BASE}/flights/search?source=${encodeURIComponent(source)}&destination=${encodeURIComponent(destination)}&sort=${currentSort}`;
        if (airlineFilter !== "all") {
            url += `&airline=${encodeURIComponent(airlineFilter)}`;
        }

        const res = await fetch(url);
        const data = await res.json();

        if (res.ok && data.success) {
            countBadge.textContent = `${data.count} flights found from ${source} to ${destination}`;
            renderFlightCards(data.flights, source, destination);
        } else {
            renderNoFlights(source, destination);
        }
    } catch (err) {
        container.innerHTML = `<div class="alert alert-danger">Failed to search flights. Ensure backend is running.</div>`;
    }
}

function renderFlightCards(flights, source = "", destination = "") {
    const container = document.getElementById("flights-container");

    if (!flights || flights.length === 0) {
        renderNoFlights(source, destination);
        return;
    }

    // Class multiplier calculation
    let multiplier = 1.0;
    if (selectedClass.includes("Premium")) multiplier = 1.35;
    else if (selectedClass.includes("Business")) multiplier = 2.2;
    else if (selectedClass.includes("First")) multiplier = 3.5;

    container.innerHTML = flights.map(flight => {
        const adjustedPrice = Math.round(parseFloat(flight.price) * multiplier);
        const availableSeats = flight.available_seats !== undefined ? flight.available_seats : 180;
        const flightStatus = (flight.status || "SCHEDULED").toUpperCase();
        const isSoldOut = availableSeats <= 0;
        const isCancelled = flightStatus === "CANCELLED";

        // Status badge styling
        let statusBadgeClass = "badge-status-scheduled";
        if (flightStatus === "DELAYED") statusBadgeClass = "badge-status-delayed";
        else if (flightStatus === "CANCELLED") statusBadgeClass = "badge-status-cancelled";
        else if (flightStatus === "DEPARTED") statusBadgeClass = "badge-status-departed";
        else if (flightStatus === "ARRIVED") statusBadgeClass = "badge-status-arrived";

        return `
            <div class="flight-card shadow-sm">
                <div class="row align-items-center g-3">
                    <!-- Airline & Flight Code -->
                    <div class="col-md-3">
                        <div class="d-flex align-items-center gap-2 mb-1 flex-wrap">
                            <span class="badge bg-primary airline-badge">${flight.airline_name}</span>
                            <span class="fw-bold font-monospace text-navy">${flight.flight_number}</span>
                            <span class="badge ${statusBadgeClass}">${flightStatus}</span>
                        </div>
                        <span class="badge bg-light text-secondary border small">${selectedClass}</span>
                    </div>

                    <!-- Timings & Flight Path -->
                    <div class="col-md-5">
                        <div class="row align-items-center text-center">
                            <div class="col-4 text-start">
                                <div class="flight-time">${flight.departure_time_formatted}</div>
                                <div class="fw-bold text-navy">${flight.source}</div>
                            </div>
                            <div class="col-4 px-1">
                                <div class="small text-muted fw-semibold">${flight.duration}</div>
                                <div class="flight-path-line">
                                    <i class="bi bi-airplane-fill flight-path-plane"></i>
                                </div>
                                <span class="badge bg-success-subtle text-success small" style="font-size: 0.7rem;">Non-stop</span>
                            </div>
                            <div class="col-4 text-end">
                                <div class="flight-time">${flight.arrival_time_formatted}</div>
                                <div class="fw-bold text-navy">${flight.destination}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Seats & Pricing -->
                    <div class="col-md-2 text-md-center">
                        <div class="fs-4 fw-extrabold text-success">₹${adjustedPrice.toLocaleString()}</div>
                        <div class="small ${availableSeats <= 10 ? 'text-danger fw-bold' : 'text-muted'}">
                            <i class="bi bi-person-fill"></i> ${isSoldOut ? 'Flight Full' : `${availableSeats} seats left`}
                        </div>
                    </div>

                    <!-- Action Button -->
                    <div class="col-md-2 text-md-end">
                        ${isCancelled ? `
                            <button class="btn btn-secondary px-3 py-2 fw-bold w-100 rounded-pill disabled" disabled>
                                Cancelled
                            </button>
                        ` : isSoldOut ? `
                            <button class="btn btn-warning px-3 py-2 fw-bold w-100 rounded-pill text-dark shadow-sm"
                                    onclick="openWaitlistModal(${flight.flight_id})">
                                <i class="bi bi-hourglass-split me-1"></i> Join Waitlist
                            </button>
                        ` : `
                            <button class="btn btn-primary px-4 py-2 fw-bold w-100 rounded-pill"
                                    onclick="openBookingDetails(${flight.flight_id})">
                                Book Now
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function renderNoFlights(source, destination) {
    const container = document.getElementById("flights-container");
    container.innerHTML = `
        <div class="card border-0 shadow-sm rounded-4 text-center p-5 bg-white">
            <i class="bi bi-airplane text-muted display-4 mb-3 d-block"></i>
            <h4 class="fw-bold text-navy">No flights found for this route</h4>
            <p class="text-muted col-md-6 mx-auto mb-4">
                We currently don't have direct scheduled flights from <strong>${source || 'selected city'}</strong> to <strong>${destination || 'destination'}</strong>. 
                Explore our popular routes like Pune &rarr; Delhi or Mumbai &rarr; Bangalore.
            </p>
            <div>
                <button class="btn btn-outline-primary px-4 fw-semibold rounded-pill" onclick="loadAllFlights()">
                    <i class="bi bi-list-nested me-1"></i> View All Scheduled Flights
                </button>
            </div>
        </div>
    `;
}

// ========================================================
// 4. MULTI-STEP BOOKING & PASSENGERS FORM
// ========================================================
async function openBookingDetails(flightId) {
    if (!currentUser) {
        showToast("Please sign in or create an account to book a ticket.", "warning");
        openAuthModal("login");
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/flights/${flightId}`);
        const data = await res.json();

        if (res.ok && data.success) {
            selectedFlight = data.flight;
            selectedSeats = [];

            // Compute price according to selected travel class
            let multiplier = 1.0;
            if (selectedClass.includes("Premium")) multiplier = 1.35;
            else if (selectedClass.includes("Business")) multiplier = 2.2;
            else if (selectedClass.includes("First")) multiplier = 3.5;

            const basePrice = Math.round(parseFloat(selectedFlight.price) * multiplier);
            const totalFare = basePrice * selectedPassengersCount;

            // Reset booking steps UI
            document.getElementById("booking-step-passengers")?.classList.remove("d-none");
            document.getElementById("booking-step-seats")?.classList.add("d-none");
            document.getElementById("booking-step-payment")?.classList.add("d-none");

            document.getElementById("step-pill-seat")?.classList.replace("bg-primary", "bg-secondary");
            document.getElementById("step-pill-pay")?.classList.replace("bg-primary", "bg-secondary");

            // Populate flight summary
            document.getElementById("book-selected-flight-id").value = selectedFlight.flight_id;
            document.getElementById("sum-airline").textContent = selectedFlight.airline_name;
            document.getElementById("sum-flight-num").textContent = selectedFlight.flight_number;
            document.getElementById("sum-route").textContent = `${selectedFlight.source} ➔ ${selectedFlight.destination}`;
            document.getElementById("sum-schedule").textContent = `${selectedFlight.departure_date} • ${selectedFlight.departure_time_formatted}`;
            document.getElementById("sum-duration").textContent = selectedFlight.duration;
            document.getElementById("sum-class").textContent = selectedClass;
            document.getElementById("sum-base-fare").textContent = `₹${basePrice.toLocaleString()}`;
            document.getElementById("sum-pass-count").textContent = selectedPassengersCount;
            document.getElementById("sum-seat-display").textContent = "Pending selection";
            document.getElementById("sum-total-fare").textContent = `₹${totalFare.toLocaleString()}`;

            // Build dynamic passenger input forms
            buildDynamicPassengerForms(selectedPassengersCount);

            showSection("book-section");
        } else {
            showToast("Failed to load flight details.", "danger");
        }
    } catch (err) {
        showToast("Error retrieving flight details.", "danger");
    }
}

function buildDynamicPassengerForms(count) {
    const container = document.getElementById("dynamic-passengers-container");
    let html = "";

    for (let i = 1; i <= count; i++) {
        const defaultName = (i === 1 && currentUser) ? currentUser.fullName : "";
        html += `
            <div class="border rounded-3 p-3 mb-3 bg-light">
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="badge bg-navy text-white fw-bold">Passenger ${i} ${i === 1 ? '(Lead Traveler)' : ''}</span>
                    <span class="small text-muted">Govt ID Verification Required</span>
                </div>
                <div class="row g-3">
                    <div class="col-md-5">
                        <label class="form-label small fw-bold text-muted">Full Name (as per Govt ID)</label>
                        <input type="text" class="form-control pass-input-name" placeholder="e.g. Rahul Sharma" value="${defaultName}" required>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label small fw-bold text-muted">Age</label>
                        <input type="number" class="form-control pass-input-age" min="1" max="120" placeholder="Age" value="${i === 1 ? 24 : 22}" required>
                    </div>
                    <div class="col-md-2">
                        <label class="form-label small fw-bold text-muted">Gender</label>
                        <select class="form-select pass-input-gender" required>
                            <option value="Male" ${i % 2 === 1 ? 'selected' : ''}>Male</option>
                            <option value="Female" ${i % 2 === 0 ? 'selected' : ''}>Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small fw-bold text-muted">Passport / Govt ID No.</label>
                        <input type="text" class="form-control pass-input-passport" placeholder="e.g. IN9827364" value="IN${Math.floor(1000000 + Math.random() * 9000000)}">
                    </div>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;
}

// ========================================================
// 5. STEP 1 -> STEP 2: REAL CABIN SEAT SELECTION SYSTEM
// ========================================================
function proceedToSeatSelection(event) {
    if (event) event.preventDefault();

    const nameInputs = document.querySelectorAll(".pass-input-name");
    const ageInputs = document.querySelectorAll(".pass-input-age");
    const genderInputs = document.querySelectorAll(".pass-input-gender");
    const passportInputs = document.querySelectorAll(".pass-input-passport");

    currentPassengersData = [];
    for (let i = 0; i < nameInputs.length; i++) {
        const name = nameInputs[i].value.trim();
        const age = parseInt(ageInputs[i].value);
        if (!name || isNaN(age)) {
            showToast(`Please complete details for Passenger ${i + 1}`, "warning");
            return;
        }
        currentPassengersData.push({
            name,
            age,
            gender: genderInputs[i].value,
            passportNo: passportInputs[i].value.trim()
        });
    }

    // Switch view to Step 2: Seats
    document.getElementById("booking-step-passengers")?.classList.add("d-none");
    document.getElementById("booking-step-seats")?.classList.remove("d-none");
    document.getElementById("step-pill-seat")?.classList.replace("bg-secondary", "bg-primary");

    // Load aircraft cabin seat map from MySQL
    loadSeatMap(selectedFlight.flight_id);
}

function backToPassengersStep() {
    document.getElementById("booking-step-seats")?.classList.add("d-none");
    document.getElementById("booking-step-passengers")?.classList.remove("d-none");
    document.getElementById("step-pill-seat")?.classList.replace("bg-primary", "bg-secondary");
}

async function loadSeatMap(flightId) {
    const gridContainer = document.getElementById("cabin-seat-grid");
    gridContainer.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border spinner-border-sm text-primary me-2"></div>
            <span class="small text-muted">Retrieving aircraft seat statuses from MySQL...</span>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE}/flights/${flightId}/seats`);
        const data = await res.json();

        if (res.ok && data.success) {
            renderAircraftCabin(data.seats);
        } else {
            gridContainer.innerHTML = `<div class="alert alert-danger">${data.message}</div>`;
        }
    } catch (err) {
        gridContainer.innerHTML = `<div class="alert alert-danger">Error connecting to seat selection API.</div>`;
    }
}

function renderAircraftCabin(seats) {
    const gridContainer = document.getElementById("cabin-seat-grid");
    selectedSeats = [];
    updateSelectedSeatsDisplay();

    // Group seats by row (rows 1 to 20, columns A, B, C | D, E, F)
    const rowMap = {};
    seats.forEach(s => {
        const match = s.seat_number.match(/^(\d+)([A-F])$/);
        if (match) {
            const rowNum = parseInt(match[1]);
            const colLetter = match[2];
            if (!rowMap[rowNum]) rowMap[rowNum] = {};
            rowMap[rowNum][colLetter] = s;
        }
    });

    let html = "";
    const sortedRows = Object.keys(rowMap).map(Number).sort((a, b) => a - b);

    sortedRows.forEach(rowNum => {
        const cols = rowMap[rowNum];
        const isBusiness = rowNum <= 3;

        html += `
            <div class="seat-row">
                <!-- Left 3 seats (A, B, C) -->
                ${renderSingleSeat(cols['A'], isBusiness)}
                ${renderSingleSeat(cols['B'], isBusiness)}
                ${renderSingleSeat(cols['C'], isBusiness)}

                <!-- Aisle with Row Number -->
                <div class="seat-aisle">${rowNum}</div>

                <!-- Right 3 seats (D, E, F) -->
                ${renderSingleSeat(cols['D'], isBusiness)}
                ${renderSingleSeat(cols['E'], isBusiness)}
                ${renderSingleSeat(cols['F'], isBusiness)}
            </div>
        `;
    });

    gridContainer.innerHTML = html;
}

function renderSingleSeat(seatObj, isBusiness) {
    if (!seatObj) return `<div class="seat-box disabled"></div>`;

    const isBooked = seatObj.status === "BOOKED";
    const seatClass = isBooked 
        ? "seat-box booked" 
        : (isBusiness ? "seat-box business" : "seat-box available");

    return `
        <button type="button" 
                class="${seatClass}" 
                id="seat-btn-${seatObj.seat_number}"
                data-seat="${seatObj.seat_number}"
                ${isBooked ? 'disabled title="Seat Already Booked"' : `onclick="toggleSeatSelection('${seatObj.seat_number}', this)" title="Seat ${seatObj.seat_number} (${seatObj.seat_class})"`}>
            ${seatObj.seat_number}
        </button>
    `;
}

function toggleSeatSelection(seatNumber, btnEl) {
    const idx = selectedSeats.indexOf(seatNumber);

    if (idx > -1) {
        // Deselect
        selectedSeats.splice(idx, 1);
        btnEl.classList.remove("selected");
    } else {
        // Select
        if (selectedSeats.length >= selectedPassengersCount) {
            // Replace the earliest selection or alert
            showToast(`You have selected seats for all ${selectedPassengersCount} traveler(s). Click a selected seat to deselect it.`, "info");
            return;
        }
        selectedSeats.push(seatNumber);
        btnEl.classList.add("selected");
    }

    updateSelectedSeatsDisplay();
}

function updateSelectedSeatsDisplay() {
    const display = document.getElementById("selected-seats-display");
    const sumDisplay = document.getElementById("sum-seat-display");

    if (selectedSeats.length === 0) {
        if (display) display.textContent = `Select ${selectedPassengersCount} seat(s)`;
        if (sumDisplay) sumDisplay.textContent = "Pending selection";
    } else {
        const text = selectedSeats.join(", ");
        if (display) display.textContent = `${text} (${selectedSeats.length}/${selectedPassengersCount} chosen)`;
        if (sumDisplay) sumDisplay.textContent = text;
    }
}

// ========================================================
// 6. STEP 2 -> STEP 3: SIMULATED PAYMENT MODULE
// ========================================================
function proceedToPaymentStep() {
    if (selectedSeats.length !== selectedPassengersCount) {
        showToast(`Please select exactly ${selectedPassengersCount} seat(s) for your ${selectedPassengersCount} passenger(s).`, "warning");
        return;
    }

    // Switch view to Step 3: Payment
    document.getElementById("booking-step-seats")?.classList.add("d-none");
    document.getElementById("booking-step-payment")?.classList.remove("d-none");
    document.getElementById("step-pill-pay")?.classList.replace("bg-secondary", "bg-primary");

    // Calculate total amount payable
    let multiplier = 1.0;
    if (selectedClass.includes("Premium")) multiplier = 1.35;
    else if (selectedClass.includes("Business")) multiplier = 2.2;
    else if (selectedClass.includes("First")) multiplier = 3.5;

    const basePrice = Math.round(parseFloat(selectedFlight.price) * multiplier);
    const totalFare = basePrice * selectedPassengersCount;

    document.getElementById("payment-total-display").textContent = `₹${totalFare.toLocaleString()}`;
}

function backToSeatStep() {
    document.getElementById("booking-step-payment")?.classList.add("d-none");
    document.getElementById("booking-step-seats")?.classList.remove("d-none");
    document.getElementById("step-pill-pay")?.classList.replace("bg-primary", "bg-secondary");
}

function selectPaymentMethod(method) {
    selectedPaymentMethod = method;

    // Update active UI cards
    document.querySelectorAll(".payment-method-card").forEach(c => c.classList.remove("active"));
    if (method === "Credit Card") document.getElementById("pay-card-cc")?.classList.add("active");
    if (method === "Debit Card") document.getElementById("pay-card-dc")?.classList.add("active");
    if (method === "UPI") document.getElementById("pay-card-upi")?.classList.add("active");
    if (method === "Net Banking") document.getElementById("pay-card-nb")?.classList.add("active");

    const inputArea = document.getElementById("payment-input-area");
    if (method === "Credit Card" || method === "Debit Card") {
        inputArea.innerHTML = `
            <div class="row g-3">
                <div class="col-md-7">
                    <label class="form-label small fw-bold text-muted">${method} Number</label>
                    <input type="text" class="form-control font-monospace" placeholder="4532 •••• •••• 8921" value="4532 9821 7712 8921">
                </div>
                <div class="col-md-3">
                    <label class="form-label small fw-bold text-muted">Expiry</label>
                    <input type="text" class="form-control" placeholder="MM/YY" value="08/29">
                </div>
                <div class="col-md-2">
                    <label class="form-label small fw-bold text-muted">CVV</label>
                    <input type="password" class="form-control" placeholder="123" value="789">
                </div>
            </div>
        `;
    } else if (method === "UPI") {
        inputArea.innerHTML = `
            <div class="row g-3">
                <div class="col-md-8">
                    <label class="form-label small fw-bold text-muted">Virtual Payment Address (VPA / UPI ID)</label>
                    <input type="text" class="form-control font-monospace" placeholder="username@okhdfcbank" value="${currentUser ? currentUser.email.split('@')[0] : 'traveler'}@oksbi">
                </div>
                <div class="col-md-4 d-flex align-items-end">
                    <span class="badge bg-success-subtle text-success p-2 w-100 text-center"><i class="bi bi-shield-check"></i> Instant UPI Verification</span>
                </div>
            </div>
        `;
    } else if (method === "Net Banking") {
        inputArea.innerHTML = `
            <div class="row g-3">
                <div class="col-md-12">
                    <label class="form-label small fw-bold text-muted">Select Your Bank</label>
                    <select class="form-select">
                        <option value="HDFC">HDFC Bank</option>
                        <option value="SBI" selected>State Bank of India (SBI)</option>
                        <option value="ICICI">ICICI Bank</option>
                        <option value="AXIS">Axis Bank</option>
                        <option value="KOTAK">Kotak Mahindra Bank</option>
                    </select>
                </div>
            </div>
        `;
    }
}

// ========================================================
// 7. ACID DATABASE TRANSACTION EXECUTION
// ========================================================
async function executeTransactionalBooking() {
    if (!currentUser) {
        showToast("Session expired. Please log in again.", "danger");
        openAuthModal("login");
        return;
    }

    // Attach chosen seats to passenger records
    const passengersWithSeats = currentPassengersData.map((p, i) => ({
        ...p,
        seatNumber: selectedSeats[i]
    }));

    const btn = document.getElementById("btn-submit-booking");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Processing MySQL ACID Transaction...`;

    try {
        const res = await fetch(`${API_BASE}/bookings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: currentUser.userId,
                flightId: selectedFlight.flight_id,
                travelClass: selectedClass,
                passengers: passengersWithSeats,
                paymentMethod: selectedPaymentMethod
            })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            showToast("Reservation & simulated payment committed to MySQL!", "success");
            renderBoardingPassModal(data.booking);
            checkUpcomingTrip();
            loadNotificationBadge();
        } else {
            showToast(data.message || "Failed to complete transaction.", "danger");
        }
    } catch (err) {
        showToast("Network error during booking transaction.", "danger");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="bi bi-lock-fill me-1"></i> Pay & Confirm Reservation`;
    }
}

// ========================================================
// 8. E-TICKET / BOARDING PASS MODAL & PDF GENERATION
// ========================================================
function renderBoardingPassModal(booking) {
    const container = document.getElementById("boarding-pass-render-container");
    const passengersText = booking.passengers.map(p => `${p.name} (Seat ${p.seatNumber})`).join(", ");

    container.innerHTML = `
        <div class="ticket-pass shadow-sm">
            <div class="ticket-header d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center gap-2">
                    <i class="bi bi-airplane-engines-fill text-info fs-3"></i>
                    <div>
                        <h4 class="fw-bold mb-0 text-white">${booking.airlineName || 'SkyWings Airlines'}</h4>
                        <span class="small text-white-50">${booking.flightNumber} • ${booking.travelClass} Class</span>
                    </div>
                </div>
                <div class="text-end">
                    <span class="small text-white-50 d-block">PNR NUMBER</span>
                    <span class="fs-3 fw-extrabold font-monospace text-info">${booking.pnr}</span>
                </div>
            </div>

            <div class="ticket-body">
                <div class="row g-3 mb-3">
                    <div class="col-sm-6">
                        <span class="small text-muted d-block">DEPARTURE</span>
                        <h3 class="fw-bold text-navy mb-0">${booking.source}</h3>
                        <div class="small fw-semibold text-secondary">${booking.departureDate} at ${booking.departureTime}</div>
                    </div>
                    <div class="col-sm-6 text-sm-end">
                        <span class="small text-muted d-block">ARRIVAL</span>
                        <h3 class="fw-bold text-navy mb-0">${booking.destination}</h3>
                        <div class="small fw-semibold text-secondary">${booking.departureDate} at ${booking.arrivalTime}</div>
                    </div>
                </div>

                <div class="p-3 bg-light rounded-3 border mb-3 small">
                    <div class="d-flex justify-content-between mb-2">
                        <span class="text-muted">Traveler(s) & Seats:</span>
                        <span class="fw-bold text-navy">${passengersText}</span>
                    </div>
                    <div class="d-flex justify-content-between mb-2">
                        <span class="text-muted">Payment Status & Method:</span>
                        <span class="badge bg-success-subtle text-success fw-bold">${booking.paymentMethod || 'Credit Card'} • PAID</span>
                    </div>
                    <div class="d-flex justify-content-between">
                        <span class="text-muted">Total Fare Paid:</span>
                        <span class="fw-bold text-success fs-5">₹${Number(booking.totalFare).toLocaleString()}</span>
                    </div>
                </div>

                <div class="d-flex justify-content-between align-items-center pt-2 border-top small text-muted">
                    <span class="badge bg-success-subtle text-success fw-bold px-3 py-1">BOOKING STATUS: CONFIRMED</span>
                    <span>Database Record ID #${booking.bookingId}</span>
                </div>

                <div class="barcode-strip my-3"></div>
            </div>
        </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById("boardingPassModal"));
    modal.show();
}

function goToMyBookingsFromModal() {
    const modalEl = document.getElementById("boardingPassModal");
    const instance = bootstrap.Modal.getInstance(modalEl);
    if (instance) instance.hide();

    showSection("bookings-section");
}

// ========================================================
// 9. PUBLIC PNR SEARCH MODULE
// ========================================================
async function handlePNRSearch(e) {
    if (e) e.preventDefault();
    const pnrInput = document.getElementById("pnr-search-input").value.trim().toUpperCase();
    const resultContainer = document.getElementById("pnr-search-result");

    if (!pnrInput) return;

    resultContainer.innerHTML = `
        <div class="text-center py-4">
            <div class="spinner-border spinner-border-sm text-primary me-2"></div>
            <span class="text-muted">Verifying PNR #${pnrInput} in MySQL database...</span>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE}/pnr/${encodeURIComponent(pnrInput)}`);
        const data = await res.json();

        if (res.ok && data.success) {
            const b = data.booking;
            resultContainer.innerHTML = `
                <div class="card border-0 bg-light rounded-4 p-4 shadow-sm">
                    <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
                        <div>
                            <span class="badge bg-success-subtle text-success fw-bold me-2">CONFIRMED</span>
                            <span class="fw-bold text-navy">${b.airline_name} ${b.flight_number}</span>
                        </div>
                        <span class="font-monospace fw-extrabold text-primary fs-5">PNR: ${b.pnr}</span>
                    </div>

                    <div class="row g-3 mb-3">
                        <div class="col-6">
                            <span class="small text-muted d-block">Route:</span>
                            <h5 class="fw-extrabold text-navy mb-0">${b.source} ➔ ${b.destination}</h5>
                            <span class="small text-muted">${b.departure_date} • ${b.departure_time_formatted}</span>
                        </div>
                        <div class="col-6 text-end">
                            <span class="small text-muted d-block">Assigned Seat:</span>
                            <h4 class="fw-extrabold text-primary mb-0">${b.seat_no}</h4>
                            <span class="badge bg-info-subtle text-info">Flight Status: ${b.flight_status || 'SCHEDULED'}</span>
                        </div>
                    </div>

                    <div class="bg-white p-3 rounded-3 border small mb-3">
                        <div class="d-flex justify-content-between mb-1">
                            <span class="text-muted">Passenger:</span>
                            <span class="fw-bold text-navy">${b.passenger_name} (${b.age} yrs, ${b.gender})</span>
                        </div>
                        <div class="d-flex justify-content-between mb-1">
                            <span class="text-muted">Booked By:</span>
                            <span class="text-secondary">${b.user_name}</span>
                        </div>
                        <div class="d-flex justify-content-between">
                            <span class="text-muted">Payment:</span>
                            <span class="text-success fw-bold">₹${Number(b.total_fare).toLocaleString()} (PAID - ${b.transaction_id})</span>
                        </div>
                    </div>

                    <button class="btn btn-outline-primary btn-sm rounded-pill w-100" onclick="viewExistingPass(${JSON.stringify(b).replace(/"/g, '&quot;')})">
                        <i class="bi bi-printer me-1"></i> View & Print Official Boarding Pass
                    </button>
                </div>
            `;
        } else {
            resultContainer.innerHTML = `
                <div class="alert alert-warning text-center">
                    <i class="bi bi-exclamation-triangle-fill me-2"></i>
                    ${data.message || 'No reservation found matching this PNR.'}
                </div>
            `;
        }
    } catch (err) {
        resultContainer.innerHTML = `<div class="alert alert-danger">Error connecting to PNR tracking server.</div>`;
    }
}

// ========================================================
// 10. MY BOOKINGS & BOOKING HISTORY
// ========================================================
async function loadUserBookings() {
    const container = document.getElementById("user-bookings-container");
    const prompt = document.getElementById("bookings-login-prompt");

    if (!currentUser) {
        prompt?.classList.remove("d-none");
        if (container) container.innerHTML = "";
        return;
    }

    prompt?.classList.add("d-none");
    container.innerHTML = `
        <div class="col-12 text-center py-5 text-muted">
            <div class="spinner-border spinner-border-sm text-primary me-2"></div>
            Executing relational SQL JOIN across bookings, passengers, users, and flights...
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE}/bookings/user/${currentUser.userId}`);
        const data = await res.json();

        if (res.ok && data.success) {
            userBookingsCache = data.bookings;
            filterBookingHistory("all");
        } else {
            container.innerHTML = `<div class="col-12 alert alert-danger">${data.message}</div>`;
        }
    } catch (err) {
        container.innerHTML = `<div class="col-12 alert alert-danger">Error retrieving bookings from database.</div>`;
    }
}

function filterBookingHistory(type) {
    document.querySelectorAll(".hist-tab-btn").forEach(b => b.classList.remove("active"));
    document.getElementById(`hist-tab-${type}`)?.classList.add("active");

    const container = document.getElementById("user-bookings-container");
    const today = new Date().toISOString().split("T")[0];

    let filtered = userBookingsCache;
    if (type === "upcoming") {
        filtered = userBookingsCache.filter(b => b.departure_date >= today && b.flight_status !== "CANCELLED");
    } else if (type === "completed") {
        filtered = userBookingsCache.filter(b => b.departure_date < today && b.flight_status !== "CANCELLED");
    } else if (type === "cancelled") {
        filtered = userBookingsCache.filter(b => b.flight_status === "CANCELLED");
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="col-12 text-center py-5 bg-white rounded-4 border shadow-sm">
                <i class="bi bi-ticket-perforated display-4 text-muted mb-3 d-block"></i>
                <h4 class="fw-bold text-navy">No ${type === 'all' ? '' : type} Bookings Found</h4>
                <p class="text-muted col-md-6 mx-auto mb-4">You do not have any ${type === 'all' ? 'active' : type} flight records in the database.</p>
                <button class="btn btn-primary px-4 fw-semibold rounded-pill" onclick="showSection('search-section'); loadAllFlights();">
                    Explore Flights
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(b => `
        <div class="col-lg-6">
            <div class="my-booking-card shadow-sm h-100">
                <div class="my-booking-header d-flex justify-content-between align-items-center">
                    <div>
                        <span class="badge bg-primary airline-badge">${b.airline_name} ${b.flight_number}</span>
                        <span class="badge bg-dark font-monospace ms-2">PNR: ${b.pnr}</span>
                    </div>
                    <span class="badge bg-success-subtle text-success">${b.flight_status || 'CONFIRMED'}</span>
                </div>
                <div class="card-body p-4">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div>
                            <h4 class="fw-extrabold text-navy mb-0">${b.source} ➔ ${b.destination}</h4>
                            <div class="small text-muted">${b.departure_date} • Dep: ${b.departure_time_formatted || '08:00 AM'}</div>
                        </div>
                        <div class="text-end">
                            <span class="fs-4 fw-extrabold text-success">₹${Number(b.total_fare).toLocaleString()}</span>
                            <div class="small text-muted">Seat: <strong class="text-primary font-monospace">${b.seat_no}</strong></div>
                        </div>
                    </div>

                    <div class="bg-light p-2 rounded-3 border small mb-3">
                        <div class="d-flex justify-content-between">
                            <span class="text-muted">Passenger:</span>
                            <span class="fw-bold text-navy">${b.passenger_name} (${b.age} yrs, ${b.gender})</span>
                        </div>
                        <div class="d-flex justify-content-between mt-1">
                            <span class="text-muted">Booked By:</span>
                            <span class="text-secondary">${b.user_name} (${b.user_email})</span>
                        </div>
                    </div>

                    <div class="d-flex justify-content-between align-items-center pt-2 border-top">
                        <button class="btn btn-outline-primary btn-sm rounded-pill px-3" onclick="viewExistingPass(${JSON.stringify(b).replace(/"/g, '&quot;')})">
                            <i class="bi bi-printer me-1"></i> E-Ticket PDF
                        </button>
                        <button class="btn btn-outline-danger btn-sm rounded-pill px-3" 
                                onclick="promptCancelBooking(${b.booking_id}, '${b.pnr}', '${b.flight_number}', '${b.passenger_name}', '${b.source} to ${b.destination}', ${b.total_fare})">
                            <i class="bi bi-x-circle me-1"></i> Cancel & Refund
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join("");
}

function viewExistingPass(b) {
    const bookingObj = {
        bookingId: b.booking_id,
        pnr: b.pnr,
        airlineName: b.airline_name,
        flightNumber: b.flight_number,
        travelClass: "Economy",
        source: b.source,
        destination: b.destination,
        departureDate: b.departure_date,
        departureTime: b.departure_time_formatted || "08:00 AM",
        arrivalTime: b.arrival_time_formatted || "10:15 AM",
        totalFare: b.total_fare,
        paymentMethod: "Credit Card",
        passengers: [{ name: b.passenger_name, seatNumber: b.seat_no }]
    };
    renderBoardingPassModal(bookingObj);
}

// ========================================================
// 11. CANCELLATION & SIMULATED REFUND CALCULATION
// ========================================================
function promptCancelBooking(bookingId, pnr, flightNumber, passengerName, route, totalFare) {
    document.getElementById("cancel-target-id").value = bookingId;
    document.getElementById("cancel-pnr-display").textContent = pnr;
    document.getElementById("cancel-flight-display").textContent = flightNumber;
    document.getElementById("cancel-passenger-display").textContent = passengerName;
    document.getElementById("cancel-route-display").textContent = route;

    const modal = new bootstrap.Modal(document.getElementById("cancelConfirmModal"));
    modal.show();
}

async function executeCancellation() {
    const bookingId = document.getElementById("cancel-target-id").value;
    const btn = document.getElementById("btn-execute-cancel");

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Cancelling in MySQL...`;

    try {
        const res = await fetch(`${API_BASE}/bookings/${bookingId}?userId=${currentUser.userId}`, {
            method: "DELETE"
        });

        const data = await res.json();

        if (res.ok && data.success) {
            const modalEl = document.getElementById("cancelConfirmModal");
            const instance = bootstrap.Modal.getInstance(modalEl);
            if (instance) instance.hide();

            showToast(data.message, "success");
            loadUserBookings();
            checkUpcomingTrip();
            loadNotificationBadge();
        } else {
            showToast(data.message || "Failed to cancel booking.", "danger");
        }
    } catch (err) {
        showToast("Error connecting to server during cancellation.", "danger");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Yes, Cancel & Refund";
    }
}

// ========================================================
// 12. WAITLIST SYSTEM MODAL & SUBMISSION
// ========================================================
function openWaitlistModal(flightId) {
    document.getElementById("wl-flight-id").value = flightId;
    if (currentUser) {
        document.getElementById("wl-name").value = currentUser.fullName;
        document.getElementById("wl-email").value = currentUser.email;
        document.getElementById("wl-phone").value = currentUser.phone || "9876543210";
    }
    const modal = new bootstrap.Modal(document.getElementById("waitlistModal"));
    modal.show();
}

async function handleJoinWaitlistSubmit(e) {
    e.preventDefault();
    const flightId = document.getElementById("wl-flight-id").value;
    const passengerName = document.getElementById("wl-name").value.trim();
    const email = document.getElementById("wl-email").value.trim();
    const phone = document.getElementById("wl-phone").value.trim();

    try {
        const res = await fetch(`${API_BASE}/flights/${flightId}/waitlist`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                userId: currentUser ? currentUser.userId : 1,
                passengerName,
                email,
                phone
            })
        });

        const data = await res.json();
        if (res.ok && data.success) {
            const modalEl = document.getElementById("waitlistModal");
            const instance = bootstrap.Modal.getInstance(modalEl);
            if (instance) instance.hide();

            showToast(data.message, "success");
            loadNotificationBadge();
        } else {
            showToast(data.message || "Failed to join waitlist.", "danger");
        }
    } catch (err) {
        showToast("Error joining waitlist.", "danger");
    }
}

// ========================================================
// 13. IN-APP NOTIFICATIONS CENTER
// ========================================================
async function loadNotificationBadge() {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_BASE}/notifications/${currentUser.userId}`);
        const data = await res.json();
        if (res.ok && data.success) {
            const badge = document.getElementById("notif-badge");
            if (data.unreadCount > 0) {
                badge.textContent = data.unreadCount;
                badge.classList.remove("d-none");
            } else {
                badge.classList.add("d-none");
            }
        }
    } catch (e) {
        // silent fail
    }
}

async function openNotificationsModal() {
    if (!currentUser) {
        showToast("Please sign in to view your notifications.", "info");
        openAuthModal("login");
        return;
    }

    const container = document.getElementById("notif-list-container");
    container.innerHTML = `
        <div class="text-center py-4 text-muted">
            <div class="spinner-border spinner-border-sm text-primary me-2"></div>
            Loading notifications from MySQL...
        </div>
    `;

    const modal = new bootstrap.Modal(document.getElementById("notificationsModal"));
    modal.show();

    try {
        const res = await fetch(`${API_BASE}/notifications/${currentUser.userId}`);
        const data = await res.json();

        if (res.ok && data.success) {
            if (data.notifications.length === 0) {
                container.innerHTML = `<div class="text-center py-4 text-muted">No notifications yet.</div>`;
                return;
            }

            container.innerHTML = data.notifications.map(n => `
                <div class="p-3 mb-2 rounded-3 border ${n.is_read ? 'bg-light' : 'bg-white border-primary shadow-sm'}">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <span class="badge ${n.notification_type.includes('CONFIRMED') ? 'bg-success' : (n.notification_type.includes('CANCEL') ? 'bg-danger' : 'bg-primary')} small">
                            ${n.notification_type}
                        </span>
                        <span class="small text-muted">${new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p class="small mb-1 text-navy fw-semibold">${n.message}</p>
                    ${!n.is_read ? `
                        <button class="btn btn-link btn-sm p-0 text-decoration-none small text-primary" onclick="markNotificationRead(${n.notification_id})">
                            Mark as read
                        </button>
                    ` : ''}
                </div>
            `).join("");

            loadNotificationBadge();
        }
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">Error loading notifications.</div>`;
    }
}

async function markNotificationRead(id) {
    try {
        await fetch(`${API_BASE}/notifications/${id}/read`, { method: "PUT" });
        openNotificationsModal();
    } catch (e) {}
}

async function markAllNotificationsRead() {
    if (!currentUser) return;
    try {
        await fetch(`${API_BASE}/notifications/user/${currentUser.userId}/read-all`, { method: "PUT" });
        openNotificationsModal();
    } catch (e) {}
}

// ========================================================
// 14. ADMIN PORTAL, DASHBOARD & CHARTS
// ========================================================
function openAdminPortal() {
    if (!currentUser) {
        showToast("Administrator authentication required. Sign in with admin credentials.", "info");
        openAuthModal("login");
        document.getElementById("login-email").value = "admin@skywings.com";
        document.getElementById("login-password").value = "admin123";
        return;
    }

    if (currentUser.role !== "ADMIN") {
        showToast("Access Denied: Your account role is USER. Only administrators can access this portal.", "danger");
        return;
    }

    showSection("admin-section");
    loadAdminStats();
    switchAdminTab("flights");
}

async function loadAdminStats() {
    try {
        const res = await fetch(`${API_BASE}/admin/stats`);
        const data = await res.json();

        if (res.ok && data.success) {
            const s = data.stats;
            document.getElementById("adm-stat-users").textContent = s.totalUsers;
            document.getElementById("adm-stat-flights").textContent = s.totalFlights;
            document.getElementById("adm-stat-bookings").textContent = s.totalBookings;
            document.getElementById("adm-stat-revenue").textContent = `₹${s.totalRevenue.toLocaleString()}`;
            document.getElementById("adm-stat-waitlist").textContent = s.waitlistedPassengers;
            document.getElementById("adm-stat-cancellations").textContent = s.cancelledBookings;
        }

        // Load reports for charts
        const repRes = await fetch(`${API_BASE}/admin/reports/summary`);
        const repData = await repRes.json();
        if (repRes.ok && repData.success) {
            renderAdminCharts(repData.popularRoutes, repData.flightWise);
        }
    } catch (err) {
        console.error("Admin stats error:", err);
    }
}

function renderAdminCharts(popularRoutes, flightWise) {
    // 1. Popular Routes Bar Chart
    const routeCtx = document.getElementById("adminRouteChart")?.getContext("2d");
    if (routeCtx) {
        if (routeChartInstance) routeChartInstance.destroy();

        const labels = popularRoutes.map(r => `${r.source}➔${r.destination}`);
        const counts = popularRoutes.map(r => r.total_bookings);

        routeChartInstance = new Chart(routeCtx, {
            type: "bar",
            data: {
                labels: labels.length > 0 ? labels : ["Pune➔Delhi", "Mumbai➔Delhi", "Delhi➔Goa"],
                datasets: [{
                    label: "Confirmed Bookings",
                    data: counts.length > 0 ? counts : [12, 9, 7],
                    backgroundColor: "#0066b2",
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    }

    // 2. Occupancy Doughnut Chart
    const occCtx = document.getElementById("adminOccupancyChart")?.getContext("2d");
    if (occCtx) {
        if (occupancyChartInstance) occupancyChartInstance.destroy();

        const totalBooked = flightWise.reduce((acc, f) => acc + (f.booked_seats || 0), 0) || 50;
        const totalCapacity = flightWise.reduce((acc, f) => acc + (f.total_seats || 180), 0) || 200;
        const available = Math.max(0, totalCapacity - totalBooked);

        occupancyChartInstance = new Chart(occCtx, {
            type: "doughnut",
            data: {
                labels: ["Booked Seats", "Available Seats"],
                datasets: [{
                    data: [totalBooked, available],
                    backgroundColor: ["#10b981", "#e2e8f0"]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
}

function switchAdminTab(tab) {
    currentAdminTab = tab;
    document.querySelectorAll(".admin-nav-pill").forEach(p => p.classList.remove("active"));
    document.getElementById(`adm-pill-${tab}`)?.classList.add("active");

    const content = document.getElementById("admin-tab-content");

    if (tab === "flights") renderAdminFlightsTab(content);
    else if (tab === "airports") renderAdminAirportsTab(content);
    else if (tab === "aircraft") renderAdminAircraftTab(content);
    else if (tab === "users") renderAdminUsersTab(content);
    else if (tab === "bookings") renderAdminBookingsTab(content);
}

// 14A. Manage Flights Tab
async function renderAdminFlightsTab(container) {
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold text-navy mb-0">Scheduled Flights Management</h5>
            <button class="btn btn-primary btn-sm rounded-pill" onclick="showAddFlightModal()">
                <i class="bi bi-plus-circle me-1"></i> Add New Flight
            </button>
        </div>
        <div class="table-responsive">
            <table class="table table-hover align-middle small">
                <thead class="table-light">
                    <tr>
                        <th>Flight #</th>
                        <th>Airline</th>
                        <th>Route</th>
                        <th>Departure</th>
                        <th>Fare</th>
                        <th>Available Seats</th>
                        <th>Flight Status</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody id="adm-flights-tbody">
                    <tr><td colspan="8" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading flights from MySQL...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE}/flights`);
        const data = await res.json();
        const tbody = document.getElementById("adm-flights-tbody");

        if (res.ok && data.success) {
            tbody.innerHTML = data.flights.map(f => `
                <tr>
                    <td class="font-monospace fw-bold text-navy">${f.flight_number}</td>
                    <td>${f.airline_name}</td>
                    <td><strong>${f.source}</strong> ➔ <strong>${f.destination}</strong></td>
                    <td>${f.departure_date} ${f.departure_time_formatted}</td>
                    <td class="text-success fw-bold">₹${Number(f.price).toLocaleString()}</td>
                    <td>${f.available_seats} / ${f.total_seats}</td>
                    <td>
                        <select class="form-select form-select-sm" onchange="updateFlightStatus(${f.flight_id}, this.value)">
                            <option value="SCHEDULED" ${f.status === 'SCHEDULED' ? 'selected' : ''}>SCHEDULED</option>
                            <option value="DELAYED" ${f.status === 'DELAYED' ? 'selected' : ''}>DELAYED</option>
                            <option value="CANCELLED" ${f.status === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
                            <option value="DEPARTED" ${f.status === 'DEPARTED' ? 'selected' : ''}>DEPARTED</option>
                            <option value="ARRIVED" ${f.status === 'ARRIVED' ? 'selected' : ''}>ARRIVED</option>
                        </select>
                    </td>
                    <td class="text-end">
                        <button class="btn btn-outline-danger btn-sm rounded-pill" onclick="deleteAdminFlight(${f.flight_id}, '${f.flight_number}')">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join("");
        }
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">Error loading flights.</div>`;
    }
}

async function updateFlightStatus(flightId, newStatus) {
    try {
        const res = await fetch(`${API_BASE}/admin/flights/${flightId}/status`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast(`Flight status updated to ${newStatus}. Affected ticket holders notified.`, "success");
            loadNotificationBadge();
        } else {
            showToast("Failed to update status.", "danger");
        }
    } catch (e) {
        showToast("Error updating flight status.", "danger");
    }
}

async function deleteAdminFlight(flightId, flightNum) {
    if (!confirm(`Are you sure you want to delete flight ${flightNum}? Active bookings check will be enforced.`)) return;

    try {
        const res = await fetch(`${API_BASE}/admin/flights/${flightId}`, { method: "DELETE" });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast(data.message, "success");
            switchAdminTab("flights");
            loadAdminStats();
        } else {
            showToast(data.message || "Failed to delete flight.", "warning");
        }
    } catch (e) {
        showToast("Error deleting flight.", "danger");
    }
}

function showAddFlightModal() {
    const flightNumber = prompt("Enter Flight Number (e.g. AI701):");
    if (!flightNumber) return;
    const source = prompt("Enter Departure City (e.g. Pune):");
    const destination = prompt("Enter Destination City (e.g. Goa):");
    const price = prompt("Enter Base Price in INR (e.g. 4500):");

    if (!source || !destination || !price) return;

    fetch(`${API_BASE}/admin/flights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            flight_number: flightNumber,
            source,
            destination,
            departure_time: "2026-10-02 09:00:00",
            arrival_time: "2026-10-02 10:15:00",
            price: parseFloat(price),
            total_seats: 180,
            status: "SCHEDULED"
        })
    }).then(r => r.json()).then(data => {
        if (data.success) {
            showToast(data.message, "success");
            switchAdminTab("flights");
            loadAdminStats();
        } else {
            showToast(data.message, "danger");
        }
    });
}

// 14B. Manage Airports Tab
async function renderAdminAirportsTab(container) {
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold text-navy mb-0">Domestic Airports Directory</h5>
            <button class="btn btn-primary btn-sm rounded-pill" onclick="showAddAirportModal()">
                <i class="bi bi-plus-circle me-1"></i> Add Airport
            </button>
        </div>
        <div class="table-responsive">
            <table class="table table-hover align-middle small">
                <thead class="table-light">
                    <tr>
                        <th>Code</th>
                        <th>Airport Name</th>
                        <th>City</th>
                        <th>State</th>
                        <th>Country</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody id="adm-airports-tbody">
                    <tr><td colspan="6" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading airports from MySQL...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE}/admin/airports`);
        const data = await res.json();
        const tbody = document.getElementById("adm-airports-tbody");

        if (res.ok && data.success) {
            tbody.innerHTML = data.airports.map(a => `
                <tr>
                    <td><span class="badge bg-navy text-white font-monospace">${a.airport_code}</span></td>
                    <td class="fw-bold">${a.airport_name}</td>
                    <td>${a.city}</td>
                    <td>${a.state || '-'}</td>
                    <td>${a.country}</td>
                    <td class="text-end">
                        <button class="btn btn-outline-danger btn-sm rounded-pill" onclick="deleteAdminAirport(${a.airport_id})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join("");
        }
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">Error loading airports.</div>`;
    }
}

function showAddAirportModal() {
    const code = prompt("Airport Code (e.g. AMD):");
    if (!code) return;
    const name = prompt("Airport Name (e.g. Sardar Vallabhbhai Patel International Airport):");
    const city = prompt("City (e.g. Ahmedabad):");
    const state = prompt("State (e.g. Gujarat):");

    fetch(`${API_BASE}/admin/airports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ airport_code: code, airport_name: name, city, state, country: "India" })
    }).then(r => r.json()).then(data => {
        showToast(data.message, data.success ? "success" : "danger");
        switchAdminTab("airports");
    });
}

function deleteAdminAirport(id) {
    if (!confirm("Delete this airport?")) return;
    fetch(`${API_BASE}/admin/airports/${id}`, { method: "DELETE" })
        .then(r => r.json())
        .then(data => {
            showToast(data.message, "success");
            switchAdminTab("airports");
        });
}

// 14C. Manage Aircraft Tab
async function renderAdminAircraftTab(container) {
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="fw-bold text-navy mb-0">Commercial Aircraft Fleet</h5>
            <button class="btn btn-primary btn-sm rounded-pill" onclick="showAddAircraftModal()">
                <i class="bi bi-plus-circle me-1"></i> Add Aircraft
            </button>
        </div>
        <div class="table-responsive">
            <table class="table table-hover align-middle small">
                <thead class="table-light">
                    <tr>
                        <th>Tail #</th>
                        <th>Model / Aircraft Type</th>
                        <th>Operating Airline</th>
                        <th>Total Seats</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody id="adm-aircraft-tbody">
                    <tr><td colspan="5" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading fleet from MySQL...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE}/admin/aircraft`);
        const data = await res.json();
        const tbody = document.getElementById("adm-aircraft-tbody");

        if (res.ok && data.success) {
            tbody.innerHTML = data.aircraft.map(ac => `
                <tr>
                    <td><span class="badge bg-primary text-white font-monospace">${ac.aircraft_number}</span></td>
                    <td class="fw-bold">${ac.aircraft_type}</td>
                    <td>${ac.airline}</td>
                    <td>${ac.total_seats} Seats</td>
                    <td class="text-end">
                        <button class="btn btn-outline-danger btn-sm rounded-pill" onclick="deleteAdminAircraft(${ac.aircraft_id})">
                            <i class="bi bi-trash"></i>
                        </button>
                    </td>
                </tr>
            `).join("");
        }
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">Error loading aircraft.</div>`;
    }
}

function showAddAircraftModal() {
    const tail = prompt("Aircraft Tail # (e.g. VT-SKY):");
    if (!tail) return;
    const type = prompt("Aircraft Type (e.g. Airbus A321XLR):");
    const seats = prompt("Total Seats (e.g. 190):");
    const airline = prompt("Operating Airline (e.g. SkyWings):");

    fetch(`${API_BASE}/admin/aircraft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aircraft_number: tail, aircraft_type: type, total_seats: parseInt(seats) || 180, airline })
    }).then(r => r.json()).then(data => {
        showToast(data.message, data.success ? "success" : "danger");
        switchAdminTab("aircraft");
    });
}

function deleteAdminAircraft(id) {
    if (!confirm("Remove aircraft from fleet?")) return;
    fetch(`${API_BASE}/admin/aircraft/${id}`, { method: "DELETE" })
        .then(r => r.json())
        .then(data => {
            showToast(data.message, "success");
            switchAdminTab("aircraft");
        });
}

// 14D. Manage Users Tab
async function renderAdminUsersTab(container) {
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
                <h5 class="fw-bold text-navy mb-0">Registered Users & Role Management</h5>
                <span class="small text-muted">User passwords are safely hidden and never exposed in the interface.</span>
            </div>
        </div>
        <div class="table-responsive">
            <table class="table table-hover align-middle small">
                <thead class="table-light">
                    <tr>
                        <th>User ID</th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Phone</th>
                        <th>Role</th>
                        <th>Registered Date</th>
                        <th class="text-end">Actions</th>
                    </tr>
                </thead>
                <tbody id="adm-users-tbody">
                    <tr><td colspan="7" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading users from MySQL...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE}/admin/users`);
        const data = await res.json();
        const tbody = document.getElementById("adm-users-tbody");

        if (res.ok && data.success) {
            tbody.innerHTML = data.users.map(u => `
                <tr>
                    <td class="font-monospace">#${u.user_id}</td>
                    <td class="fw-bold">${u.name}</td>
                    <td>${u.email}</td>
                    <td>${u.phone || '-'}</td>
                    <td>
                        <span class="badge ${u.role === 'ADMIN' ? 'bg-warning text-dark' : 'bg-secondary'}">${u.role}</span>
                    </td>
                    <td>${u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Active'}</td>
                    <td class="text-end">
                        <button class="btn btn-outline-primary btn-sm rounded-pill" onclick="toggleUserRole(${u.user_id}, '${u.role}')">
                            Toggle ${u.role === 'ADMIN' ? 'to USER' : 'to ADMIN'}
                        </button>
                    </td>
                </tr>
            `).join("");
        }
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">Error loading users.</div>`;
    }
}

async function toggleUserRole(userId, currentRole) {
    const newRole = currentRole === "ADMIN" ? "USER" : "ADMIN";
    try {
        const res = await fetch(`${API_BASE}/admin/users/${userId}/role`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: newRole })
        });
        const data = await res.json();
        if (res.ok && data.success) {
            showToast(`User role updated to ${newRole}.`, "success");
            switchAdminTab("users");
        }
    } catch (e) {
        showToast("Error updating user role.", "danger");
    }
}

// 14E. All Bookings Tab
async function renderAdminBookingsTab(container) {
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
            <h5 class="fw-bold text-navy mb-0">System Master Bookings Registry</h5>
            <input type="text" class="form-control form-control-sm w-auto" placeholder="Filter by PNR or User..." onkeyup="filterAdminBookings(this.value)">
        </div>
        <div class="table-responsive">
            <table class="table table-hover align-middle small" id="adm-bookings-table">
                <thead class="table-light">
                    <tr>
                        <th>PNR</th>
                        <th>Flight</th>
                        <th>Passenger</th>
                        <th>User (Account)</th>
                        <th>Seat</th>
                        <th>Fare</th>
                        <th>Payment Status</th>
                        <th>Flight Status</th>
                    </tr>
                </thead>
                <tbody id="adm-bookings-tbody">
                    <tr><td colspan="8" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm me-2"></div>Loading master bookings from MySQL...</td></tr>
                </tbody>
            </table>
        </div>
    `;

    try {
        const res = await fetch(`${API_BASE}/admin/bookings`);
        const data = await res.json();
        const tbody = document.getElementById("adm-bookings-tbody");

        if (res.ok && data.success) {
            tbody.innerHTML = data.bookings.map(b => `
                <tr class="adm-booking-row">
                    <td><span class="badge bg-dark font-monospace">${b.pnr}</span></td>
                    <td><strong>${b.flight_number}</strong> (${b.source}➔${b.destination})</td>
                    <td class="fw-bold">${b.passenger_name} (${b.age}y, ${b.gender})</td>
                    <td>${b.user_name} <span class="text-muted small">&lt;${b.user_email}&gt;</span></td>
                    <td class="text-primary font-monospace fw-bold">${b.seat_no}</td>
                    <td class="text-success fw-bold">₹${Number(b.price).toLocaleString()}</td>
                    <td><span class="badge bg-success-subtle text-success">${b.payment_status}</span></td>
                    <td><span class="badge bg-primary-subtle text-primary">${b.flight_status || 'SCHEDULED'}</span></td>
                </tr>
            `).join("");
        }
    } catch (e) {
        container.innerHTML = `<div class="alert alert-danger">Error loading master bookings.</div>`;
    }
}

function filterAdminBookings(query) {
    const q = query.toLowerCase();
    document.querySelectorAll(".adm-booking-row").forEach(row => {
        row.style.display = row.innerText.toLowerCase().includes(q) ? "" : "none";
    });
}

// ========================================================
// 15. AUTHENTICATION (LOGIN & REGISTRATION)
// ========================================================
function openAuthModal(tab = "login") {
    switchAuthTab(tab);
    const modal = new bootstrap.Modal(document.getElementById("authModal"));
    modal.show();
}

function switchAuthTab(tab) {
    const loginTab = document.getElementById("tab-login");
    const regTab = document.getElementById("tab-register");
    const loginContainer = document.getElementById("login-container");
    const regContainer = document.getElementById("register-container");

    if (tab === "login") {
        loginTab?.classList.add("active", "text-white");
        loginTab?.classList.remove("text-white-50");
        regTab?.classList.remove("active", "text-white");
        regTab?.classList.add("text-white-50");
        loginContainer?.classList.remove("d-none");
        regContainer?.classList.add("d-none");
    } else {
        regTab?.classList.add("active", "text-white");
        regTab?.classList.remove("text-white-50");
        loginTab?.classList.remove("active", "text-white");
        loginTab?.classList.add("text-white-50");
        regContainer?.classList.remove("d-none");
        loginContainer?.classList.add("d-none");
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    const btn = document.getElementById("btn-login-submit");

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Verifying in MySQL...`;

    try {
        const res = await fetch(`${API_BASE}/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            currentUser = data.user;
            sessionStorage.setItem("airline_user", JSON.stringify(currentUser));
            updateNavAuthUI();
            checkUpcomingTrip();
            loadNotificationBadge();

            const modalEl = document.getElementById("authModal");
            const instance = bootstrap.Modal.getInstance(modalEl);
            if (instance) instance.hide();

            showToast(data.message, "success");

            if (currentUser.role === "ADMIN") {
                openAdminPortal();
            }
        } else {
            showToast(data.message || "Invalid email or password.", "danger");
        }
    } catch (err) {
        showToast("Cannot connect to backend server.", "danger");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Sign In";
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const fullName = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const phone = document.getElementById("reg-phone").value.trim();
    const password = document.getElementById("reg-password").value;
    const confirmPassword = document.getElementById("reg-confirm-password").value;

    if (password !== confirmPassword) {
        showToast("Passwords do not match.", "warning");
        return;
    }

    const btn = document.getElementById("btn-reg-submit");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>Creating Account...`;

    try {
        const res = await fetch(`${API_BASE}/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fullName, email, phone, password, confirmPassword })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            showToast("Registration successful! Please sign in.", "success");
            switchAuthTab("login");
            document.getElementById("login-email").value = email;
            document.getElementById("login-password").focus();
        } else {
            showToast(data.message || "Registration failed.", "danger");
        }
    } catch (err) {
        showToast("Error connecting to server.", "danger");
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Create Account";
    }
}

function fillTestAccount(email, password) {
    document.getElementById("login-email").value = email;
    document.getElementById("login-password").value = password;
}

function updateNavAuthUI() {
    const loggedOutDiv = document.getElementById("nav-auth-logged-out");
    const loggedInDiv = document.getElementById("nav-auth-logged-in");
    const userNameSpan = document.getElementById("nav-user-name");
    const userRoleBadge = document.getElementById("nav-user-role-badge");

    if (currentUser) {
        loggedOutDiv?.classList.add("d-none");
        loggedInDiv?.classList.remove("d-none");
        loggedInDiv?.classList.add("d-flex");
        if (userNameSpan) userNameSpan.textContent = currentUser.fullName;
        if (userRoleBadge) {
            userRoleBadge.textContent = currentUser.role || "USER";
            userRoleBadge.className = `badge small ${currentUser.role === 'ADMIN' ? 'bg-warning text-dark' : 'bg-info text-dark'}`;
        }
    } else {
        loggedOutDiv?.classList.remove("d-none");
        loggedInDiv?.classList.add("d-none");
        loggedInDiv?.classList.remove("d-flex");
    }
}

function logoutUser() {
    currentUser = null;
    sessionStorage.removeItem("airline_user");
    updateNavAuthUI();
    document.getElementById("customer-dashboard-banner")?.classList.add("d-none");
    document.getElementById("notif-badge")?.classList.add("d-none");
    showToast("Signed out successfully.", "info");
    showSection("home-section");
}

async function checkUpcomingTrip() {
    const banner = document.getElementById("customer-dashboard-banner");
    const welcomeText = document.getElementById("dash-welcome-text");
    const tripStatus = document.getElementById("dash-trip-status");

    if (!currentUser) {
        banner?.classList.add("d-none");
        return;
    }

    banner?.classList.remove("d-none");
    if (welcomeText) welcomeText.textContent = `Welcome back, ${currentUser.fullName}!`;

    try {
        const res = await fetch(`${API_BASE}/bookings/user/${currentUser.userId}`);
        const data = await res.json();
        if (res.ok && data.success && data.bookings.length > 0) {
            const latest = data.bookings[0];
            if (tripStatus) {
                tripStatus.innerHTML = `Upcoming Trip: <strong>${latest.source} ➔ ${latest.destination}</strong> on <strong>${latest.departure_date}</strong> (PNR: <span class="font-monospace text-primary">${latest.pnr}</span>)`;
            }
        } else {
            if (tripStatus) tripStatus.textContent = "No upcoming trips. Search and book your next flight below.";
        }
    } catch (e) {
        if (tripStatus) tripStatus.textContent = "Search and book your next flight below.";
    }
}

// Toast Notification Utility
function showToast(message, type = "info") {
    const toastEl = document.getElementById("appToast");
    const toastMsg = document.getElementById("toastMessage");
    const toastIcon = document.getElementById("toastIcon");

    if (!toastEl || !toastMsg) return;

    toastMsg.textContent = message;

    toastEl.className = `toast align-items-center text-white border-0 shadow-lg ${
        type === 'success' ? 'bg-success' :
        type === 'danger' ? 'bg-danger' :
        type === 'warning' ? 'bg-warning text-dark' : 'bg-primary'
    }`;

    if (toastIcon) {
        toastIcon.className = `bi fs-5 ${
            type === 'success' ? 'bi-check-circle-fill' :
            type === 'danger' ? 'bi-x-circle-fill' :
            type === 'warning' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill'
        }`;
    }

    const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
    toast.show();
}
