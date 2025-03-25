document.addEventListener('DOMContentLoaded', () => {
    class CyclingTracker {
        constructor() {
            // DOM Elements
            this.startBtn = document.getElementById('start-btn');
            this.stopBtn = document.getElementById('stop-btn');
            this.centerBtn = document.getElementById('center-btn');
            this.gpsStatus = document.getElementById('gps-status');
            this.mapCoords = document.getElementById('map-coords');
            this.historyList = document.getElementById('history-list');
            
            // Stats elements
            this.currentSpeedEl = document.getElementById('current-speed');
            this.distanceEl = document.getElementById('distance');
            this.durationEl = document.getElementById('duration');
            this.avgSpeedEl = document.getElementById('avg-speed');
            this.maxSpeedEl = document.getElementById('max-speed');
            this.elevationEl = document.getElementById('elevation');
            
            // App State
            this.isTracking = false;
            this.rideInterval = null;
            this.watchId = null;
            this.currentRide = null;
            this.rideHistory = [];
            this.currentPosition = null;
            
            // Initialize the app
            this.initMap();
            this.loadHistory();
            this.setupEventListeners();
            this.checkGPSStatus();
        }
        
        initMap() {
            // Try to get current position for initial map view
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        this.currentPosition = position;
                        const { latitude, longitude } = position.coords;
                        this.map = L.map('map').setView([latitude, longitude], 15);
                        this.setupMapLayers();
                    },
                    (error) => {
                        console.warn('Could not get initial position, using default view');
                        this.map = L.map('map').setView([0, 0], 2);
                        this.setupMapLayers();
                    }
                );
            } else {
                this.map = L.map('map').setView([0, 0], 2);
                this.setupMapLayers();
            }
        }
        
        setupMapLayers() {
            // Add tile layer
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                maxZoom: 19,
            }).addTo(this.map);
            
            // Create route layer
            this.routeLayer = L.layerGroup().addTo(this.map);
            
            // Create user marker
            this.userMarker = L.circleMarker(
                this.currentPosition 
                    ? [this.currentPosition.coords.latitude, this.currentPosition.coords.longitude]
                    : [0, 0],
                {
                    radius: 8,
                    fillColor: "#ff00f7",
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                }
            ).addTo(this.map);
        }
        
        setupEventListeners() {
            this.startBtn.addEventListener('click', () => this.startRide());
            this.stopBtn.addEventListener('click', () => this.stopRide());
            this.centerBtn.addEventListener('click', () => this.centerMap());
            
            // Check GPS status periodically
            setInterval(() => this.checkGPSStatus(), 5000);
        }
        
        centerMap() {
            if (this.currentPosition) {
                const { latitude, longitude } = this.currentPosition.coords;
                this.map.setView([latitude, longitude], 15);
            }
        }
        
        checkGPSStatus() {
            if (!navigator.geolocation) {
                this.gpsStatus.innerHTML = 'GPS: <span class="status-off">NOT SUPPORTED</span>';
                return;
            }
            
            this.gpsStatus.innerHTML = 'GPS: <span class="status-waiting">CHECKING...</span>';
            
            navigator.geolocation.getCurrentPosition(
                () => {
                    this.gpsStatus.innerHTML = 'GPS: <span class="status-on">READY</span>';
                },
                (error) => {
                    let message = 'OFFLINE';
                    if (error.code === error.PERMISSION_DENIED) {
                        message = 'PERMISSION DENIED';
                    }
                    this.gpsStatus.innerHTML = `GPS: <span class="status-off">${message}</span>`;
                },
                { timeout: 3000 }
            );
        }
        
        startRide() {
            if (this.isTracking) return;
            
            // Request high accuracy GPS
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    this.currentPosition = position;
                    this.beginTracking();
                },
                (error) => {
                    alert('Could not start tracking. Please enable GPS permissions and try again.');
                    console.error('GPS Error:', error);
                },
                { enableHighAccuracy: true }
            );
        }
        
        beginTracking() {
            this.isTracking = true;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            
            // Initialize new ride data
            this.currentRide = {
                id: Date.now(),
                startTime: new Date(),
                endTime: null,
                path: [],
                stats: {
                    distance: 0,
                    duration: 0,
                    maxSpeed: 0,
                    elevationGain: 0,
                    avgSpeed: 0
                }
            };
            
            // Add initial position
            if (this.currentPosition) {
                this.updatePosition(this.currentPosition);
            }
            
            // Start tracking position
            this.watchId = navigator.geolocation.watchPosition(
                (position) => {
                    this.currentPosition = position;
                    this.updatePosition(position);
                },
                (error) => {
                    console.error('GPS Error:', error);
                    this.stopRide();
                },
                {
                    enableHighAccuracy: true,
                    maximumAge: 1000,
                    timeout: 5000
                }
            );
            
            // Start ride timer
            this.rideInterval = setInterval(() => {
                this.currentRide.stats.duration++;
                this.updateStatsDisplay();
            }, 1000);
            
            // Clear previous route
            this.routeLayer.clearLayers();
        }
        
        updatePosition(position) {
            const { latitude, longitude, accuracy, speed, altitude } = position.coords;
            const timestamp = new Date(position.timestamp);
            const newPoint = { 
                lat: latitude, 
                lng: longitude, 
                alt: altitude || 0, 
                time: timestamp, 
                speed: speed || 0 
            };
            
            // Add to current path
            this.currentRide.path.push(newPoint);
            
            // Update map
            this.updateMap(newPoint);
            
            // Update stats
            this.updateRideStats(newPoint);
            
            // Update display
            this.updateStatsDisplay();
            
            // Show coordinates
            this.mapCoords.textContent = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        }
        
        updateMap(point) {
            // Update user marker position
            this.userMarker.setLatLng([point.lat, point.lng]);
            
            // Center map on user if they're moving
            if (point.speed > 1) {
                this.map.setView([point.lat, point.lng], 15);
            }
            
            // Draw the route if we have at least 2 points
            if (this.currentRide.path.length > 1) {
                const lastPoint = this.currentRide.path[this.currentRide.path.length - 2];
                const line = L.polyline([[lastPoint.lat, lastPoint.lng], [point.lat, point.lng]], {
                    color: '#00f7ff',
                    weight: 4,
                    opacity: 0.8
                });
                this.routeLayer.addLayer(line);
            }
        }
        
        updateRideStats(newPoint) {
            const path = this.currentRide.path;
            
            if (path.length > 1) {
                const prevPoint = path[path.length - 2];
                const segmentDistance = this.calculateDistance(prevPoint, newPoint);
                this.currentRide.stats.distance += segmentDistance;
                
                // Calculate elevation gain
                if (newPoint.alt && prevPoint.alt) {
                    const elevationDiff = newPoint.alt - prevPoint.alt;
                    if (elevationDiff > 0) {
                        this.currentRide.stats.elevationGain += elevationDiff;
                    }
                }
            }
            
            // Update speed (convert m/s to km/h)
            const speedKmh = newPoint.speed ? (newPoint.speed * 3.6) : 0;
            if (speedKmh > this.currentRide.stats.maxSpeed) {
                this.currentRide.stats.maxSpeed = speedKmh;
            }
            
            // Update average speed
            if (this.currentRide.stats.duration > 0) {
                const hours = this.currentRide.stats.duration / 3600;
                this.currentRide.stats.avgSpeed = this.currentRide.stats.distance / hours;
            }
        }
        
        calculateDistance(point1, point2) {
            const R = 6371;
            const dLat = (point2.lat - point1.lat) * Math.PI / 180;
            const dLon = (point2.lng - point1.lng) * Math.PI / 180;
            const a = 
                Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) * 
                Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            return R * c;
        }
        
        updateStatsDisplay() {
            const stats = this.currentRide ? this.currentRide.stats : {
                distance: 0,
                duration: 0,
                maxSpeed: 0,
                elevationGain: 0,
                avgSpeed: 0
            };
            
            const currentSpeed = this.currentRide?.path?.length > 0 
                ? (this.currentRide.path[this.currentRide.path.length - 1].speed * 3.6 || 0) 
                : 0;
            
            this.currentSpeedEl.textContent = currentSpeed.toFixed(1);
            this.distanceEl.textContent = stats.distance.toFixed(2);
            
            const hours = Math.floor(stats.duration / 3600);
            const minutes = Math.floor((stats.duration % 3600) / 60);
            this.durationEl.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            
            this.avgSpeedEl.textContent = stats.avgSpeed.toFixed(1);
            this.maxSpeedEl.textContent = stats.maxSpeed.toFixed(1);
            this.elevationEl.textContent = Math.round(stats.elevationGain);
        }
        
        stopRide() {
            if (!this.isTracking) return;
            
            this.isTracking = false;
            this.startBtn.disabled = false;
            this.stopBtn.disabled = true;
            
            // Clear GPS watch and interval
            if (this.watchId) navigator.geolocation.clearWatch(this.watchId);
            if (this.rideInterval) clearInterval(this.rideInterval);
            
            // Finalize ride data
            this.currentRide.endTime = new Date();
            
            // Save the ride
            this.saveRide(this.currentRide);
            
            // Reset current ride
            this.currentRide = null;
            
            // Update history display
            this.loadHistory();
        }
        
        saveRide(ride) {
            this.rideHistory.push(ride);
            localStorage.setItem('cyclingTrackerHistory', JSON.stringify(this.rideHistory));
        }
        
        loadHistory() {
            const history = localStorage.getItem('cyclingTrackerHistory');
            this.rideHistory = history ? JSON.parse(history) : [];
            this.renderHistory();
        }
        
        renderHistory() {
            if (this.rideHistory.length === 0) {
                this.historyList.innerHTML = '<div class="history-empty">No rides recorded yet. Start your first ride!</div>';
                return;
            }
            
            this.historyList.innerHTML = this.rideHistory
                .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
                .map(ride => {
                    const startDate = new Date(ride.startTime);
                    const durationHours = Math.floor(ride.stats.duration / 3600);
                    const durationMinutes = Math.floor((ride.stats.duration % 3600) / 60);
                    
                    return `
                        <div class="history-item" data-id="${ride.id}">
                            <h3>${startDate.toLocaleDateString()} ${startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</h3>
                            <div class="history-stats">
                                <div class="history-stat">
                                    <span class="history-stat-value">${ride.stats.distance.toFixed(2)}</span>
                                    <span class="history-stat-label">km</span>
                                </div>
                                <div class="history-stat">
                                    <span class="history-stat-value">${durationHours.toString().padStart(2, '0')}:${durationMinutes.toString().padStart(2, '0')}</span>
                                    <span class="history-stat-label">duration</span>
                                </div>
                                <div class="history-stat">
                                    <span class="history-stat-value">${ride.stats.avgSpeed.toFixed(1)}</span>
                                    <span class="history-stat-label">avg km/h</span>
                                </div>
                            </div>
                        </div>
                    `;
                })
                .join('');
            
            document.querySelectorAll('.history-item').forEach(item => {
                item.addEventListener('click', () => this.showRideDetails(item.dataset.id));
            });
        }
        
        showRideDetails(rideId) {
            const ride = this.rideHistory.find(r => r.id === parseInt(rideId));
            if (!ride || !ride.path.length) return;
            
            this.routeLayer.clearLayers();
            
            const routePoints = ride.path.map(p => [p.lat, p.lng]);
            const routeLine = L.polyline(routePoints, {
                color: '#00f7ff',
                weight: 4,
                opacity: 0.8
            }).addTo(this.routeLayer);
            
            L.circleMarker([ride.path[0].lat, ride.path[0].lng], {
                radius: 6,
                fillColor: "#00ff00",
                color: "#fff",
                weight: 2,
                fillOpacity: 1
            }).addTo(this.routeLayer).bindPopup("Start");
            
            L.circleMarker(
                [ride.path[ride.path.length - 1].lat, ride.path[ride.path.length - 1].lng], 
                {
                    radius: 6,
                    fillColor: "#ff0000",
                    color: "#fff",
                    weight: 2,
                    fillOpacity: 1
                }
            ).addTo(this.routeLayer).bindPopup("End");
            
            this.map.fitBounds(routeLine.getBounds());
        }
    }

    // Initialize the app
    const app = new CyclingTracker();
    window.app = app; // For debugging
});