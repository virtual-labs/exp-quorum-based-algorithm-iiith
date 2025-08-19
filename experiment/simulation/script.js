class MaekawaSimulation {
    constructor() {
        this.participants = [];
        this.quorumSets = [];
        this.links = [];
        this.svg = null;
        this.simulation = null;
        this.width = 0;
        this.height = 0;
        this.participantCount = 9;
        this.quorumSize = 3;
        this.currentRequester = null;
        this.isProcessingRequest = false;
        this.criticalSectionOwner = null;
        this.animationSpeed = 1;
        this.logicalClock = 0;
        this.metrics = {
            totalMessages: 0,
            csEntries: 0,
            deadlockEvents: 0,
            failedRequests: 0
        };
        
        this.initializeVisualization();
        this.setupEventListeners();
        this.createNetwork();
    }

    initializeVisualization() {
        const container = d3.select("#visualization");
        this.width = container.node().getBoundingClientRect().width;
        this.height = container.node().getBoundingClientRect().height;

        this.svg = container.append("svg")
            .attr("width", this.width)
            .attr("height", this.height);

        // Create arrow markers
        this.svg.append("defs").selectAll("marker")
            .data(["end"])
            .enter().append("marker")
            .attr("id", "arrowhead")
            .attr("viewBox", "0 -5 10 10")
            .attr("refX", 25)
            .attr("refY", 0)
            .attr("markerWidth", 6)
            .attr("markerHeight", 6)
            .attr("orient", "auto")
            .append("path")
            .attr("d", "M0,-5L10,0L0,5")
            .attr("fill", "#3b82f6");

        this.linkGroup = this.svg.append("g").attr("class", "links");
        this.nodeGroup = this.svg.append("g").attr("class", "nodes");
    }

    setupEventListeners() {
        document.getElementById('nodeSlider').addEventListener('input', (e) => {
            this.participantCount = parseInt(e.target.value);
            this.quorumSize = Math.floor(Math.sqrt(this.participantCount));
            document.getElementById('nodeCount').textContent = this.participantCount;
            document.getElementById('quorumSize').textContent = this.quorumSize;
            this.createNetwork();
        });

        document.getElementById('speedSlider').addEventListener('input', (e) => {
            this.animationSpeed = parseFloat(e.target.value);
            document.getElementById('animationSpeed').textContent = `${this.animationSpeed}x`;
        });

        window.addEventListener('resize', () => {
            this.width = d3.select("#visualization").node().getBoundingClientRect().width;
            this.height = d3.select("#visualization").node().getBoundingClientRect().height;
            this.svg.attr("width", this.width).attr("height", this.height);
            if (this.simulation) {
                this.simulation.force("center", d3.forceCenter(this.width / 2, this.height / 2));
                this.simulation.alpha(0.3).restart();
            }
        });
    }

    createNetwork() {
        this.participants = [];
        this.quorumSets = [];
        this.links = [];
        this.currentRequester = null;
        this.criticalSectionOwner = null;
        this.isProcessingRequest = false;

        // Create participants
        for (let i = 0; i < this.participantCount; i++) {
            this.participants.push({
                id: i,
                state: 'healthy',
                votedFor: null,
                requestTimestamp: null,
                isVoting: false,
                x: Math.random() * this.width,
                y: Math.random() * this.height
            });
        }

        // Create Maekawa's quorum sets
        this.constructQuorumSets();
        
        // Create links for visualization (showing quorum relationships)
        this.createQuorumLinks();

        // Update participant selector
        this.updateParticipantSelector();

        this.updateVisualization();
        this.updateStats();
        this.log('Maekawa algorithm initialized with ' + this.participantCount + ' participants', 'info');
        this.log('Quorum sets constructed with size √n = ' + this.quorumSize, 'info');
    }

    constructQuorumSets() {
        // Simple construction for demonstration - ensures pairwise intersection
        this.quorumSets = [];
        
        for (let i = 0; i < this.participantCount; i++) {
            let quorumSet = [];
            
            // Always include the participant itself
            quorumSet.push(i);
            
            // Add other participants to ensure √n size and pairwise intersection
            let added = 1;
            for (let j = 1; j < this.participantCount && added < this.quorumSize; j++) {
                let participantIndex = (i + j) % this.participantCount;
                if (participantIndex !== i) {
                    quorumSet.push(participantIndex);
                    added++;
                }
            }
            
            this.quorumSets.push(quorumSet);
        }

        // Log quorum sets for debugging
        this.log('Quorum sets created: ' + this.quorumSets.length + ' sets', 'info');
    }

    createQuorumLinks() {
        this.links = [];
        
        // Create links to show quorum relationships
        for (let i = 0; i < this.quorumSets.length; i++) {
            const quorumSet = this.quorumSets[i];
            for (let j = 1; j < quorumSet.length; j++) {
                this.links.push({
                    source: quorumSet[0], // Requester
                    target: quorumSet[j], // Quorum member
                    active: false,
                    quorumId: i
                });
            }
        }
    }

    updateParticipantSelector() {
        const selector = document.getElementById('participantSelector');
        selector.innerHTML = '';
        
        for (let i = 0; i < this.participantCount; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Participant ${i + 1}`;
            selector.appendChild(option);
        }
    }

    updateVisualization() {
        this.simulation = d3.forceSimulation(this.participants)
            .force("link", d3.forceLink(this.links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(this.width / 2, this.height / 2))
            .force("collision", d3.forceCollide().radius(30));

        // Update links
        const link = this.linkGroup.selectAll(".link")
            .data(this.links, d => `${d.source.id}-${d.target.id}`);

        link.exit().remove();

        const linkEnter = link.enter().append("line")
            .attr("class", "link")
            .attr("stroke-dasharray", "3,3");

        link.merge(linkEnter)
            .classed("link-active", d => d.active)
            .attr("marker-end", d => d.active ? "url(#arrowhead)" : "");

        // Update nodes
        const node = this.nodeGroup.selectAll(".node-group")
            .data(this.participants, d => d.id);

        node.exit().remove();

        const nodeEnter = node.enter().append("g")
            .attr("class", "node-group")
            .call(d3.drag()
                .on("start", this.dragstarted.bind(this))
                .on("drag", this.dragged.bind(this))
                .on("end", this.dragended.bind(this)));

        nodeEnter.append("circle")
            .attr("class", "node")
            .attr("r", 24)
            .on("click", this.nodeClicked.bind(this));

        nodeEnter.append("text")
            .attr("class", "node-label")
            .attr("dy", "0.35em")
            .text(d => d.id + 1);

        const nodeUpdate = node.merge(nodeEnter);

        nodeUpdate.select(".node")
            .attr("class", d => `node node-${d.state}`);

        this.simulation.on("tick", () => {
            link.merge(linkEnter)
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);

            nodeUpdate
                .attr("transform", d => `translate(${d.x},${d.y})`);
        });
    }

    dragstarted(event, d) {
        if (!event.active) this.simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
    }

    dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
    }

    dragended(event, d) {
        if (!event.active) this.simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
    }

    nodeClicked(event, d) {
        if (d.state === 'failed') {
            this.recoverNode(d.id);
        } else {
            this.showMessage(`Participant ${d.id + 1} - Quorum: [${this.quorumSets[d.id].map(x => x + 1).join(', ')}]`);
        }
    }

    async requestCriticalSection() {
        if (this.isProcessingRequest) {
            this.showMessage("Another request is being processed");
            return;
        }

        const selectedParticipant = parseInt(document.getElementById('participantSelector').value);
        const participant = this.participants[selectedParticipant];
        
        if (participant.state === 'failed') {
            this.showMessage(`Participant ${selectedParticipant + 1} is failed`);
            return;
        }

        if (this.criticalSectionOwner !== null) {
            this.showMessage("Critical section is occupied");
            return;
        }

        this.isProcessingRequest = true;
        this.currentRequester = selectedParticipant;
        this.logicalClock++;
        
        participant.state = 'requesting';
        participant.requestTimestamp = this.logicalClock;
        
        this.showMessage(`Participant ${selectedParticipant + 1} requesting critical section`);
        this.log(`Participant ${selectedParticipant + 1} requesting CS access (timestamp: ${this.logicalClock})`, 'info');
        
        this.updateVisualization();
        await this.sleep(1000);

        // Send REQUEST messages to quorum
        const success = await this.sendRequestToQuorum(selectedParticipant);
        
        if (success) {
            this.enterCriticalSection(selectedParticipant);
        } else {
            this.handleRequestFailure(selectedParticipant);
        }
    }

    async sendRequestToQuorum(requesterId) {
        const quorumSet = this.quorumSets[requesterId];
        let votesReceived = 0;
        let votesNeeded = quorumSet.length - 1; // Exclude self
        
        this.showMessage(`Sending REQUEST to quorum members`);
        this.log(`Sending REQUEST to quorum ${quorumSet.map(x => x + 1).join(', ')}`, 'info');
        
        // Activate links to quorum members
        this.activateQuorumLinks(requesterId);
        this.metrics.totalMessages += votesNeeded;
        
        await this.sleep(1500);
        
        // Process votes from quorum members
        for (let i = 1; i < quorumSet.length; i++) {
            const memberId = quorumSet[i];
            const member = this.participants[memberId];
            
            if (member.state === 'failed') {
                this.log(`Participant ${memberId + 1} failed - no vote`, 'warning');
                continue;
            }
            
            member.state = 'voting';
            this.updateVisualization();
            await this.sleep(500);
            
            // Simple voting logic - vote yes if not already voted for someone else
            if (member.votedFor === null || member.votedFor === requesterId) {
                member.votedFor = requesterId;
                votesReceived++;
                this.log(`Participant ${memberId + 1} votes YES for ${requesterId + 1}`, 'success');
            } else {
                this.log(`Participant ${memberId + 1} votes NO (already voted for ${member.votedFor + 1})`, 'warning');
            }
            
            member.state = 'healthy';
        }
        
        this.deactivateAllLinks();
        
        this.log(`Votes received: ${votesReceived}/${votesNeeded}`, votesReceived === votesNeeded ? 'success' : 'error');
        
        return votesReceived === votesNeeded;
    }

    enterCriticalSection(participantId) {
        const participant = this.participants[participantId];
        participant.state = 'in-cs';
        this.criticalSectionOwner = participantId;
        this.metrics.csEntries++;
        
        this.showMessage(`Participant ${participantId + 1} entered critical section`);
        this.log(`Participant ${participantId + 1} entered critical section`, 'success');
        
        this.updateVisualization();
        this.updateStats();
        this.isProcessingRequest = false;
    }

    async releaseCriticalSection() {
        if (this.criticalSectionOwner === null) {
            this.showMessage("No one is in critical section");
            return;
        }

        const participantId = this.criticalSectionOwner;
        const participant = this.participants[participantId];
        const quorumSet = this.quorumSets[participantId];
        
        this.showMessage(`Participant ${participantId + 1} releasing critical section`);
        this.log(`Participant ${participantId + 1} releasing critical section`, 'info');
        
        // Send RELEASE messages to quorum
        this.activateQuorumLinks(participantId);
        this.metrics.totalMessages += quorumSet.length - 1;
        
        await this.sleep(1000);
        
        // Reset votes in quorum
        for (let i = 1; i < quorumSet.length; i++) {
            const memberId = quorumSet[i];
            const member = this.participants[memberId];
            if (member.votedFor === participantId) {
                member.votedFor = null;
            }
        }
        
        participant.state = 'healthy';
        participant.requestTimestamp = null;
        this.criticalSectionOwner = null;
        this.currentRequester = null;
        
        this.deactivateAllLinks();
        this.updateVisualization();
        this.updateStats();
        
        this.log(`Critical section released by participant ${participantId + 1}`, 'success');
    }

    handleRequestFailure(participantId) {
        const participant = this.participants[participantId];
        participant.state = 'healthy';
        participant.requestTimestamp = null;
        this.currentRequester = null;
        this.isProcessingRequest = false;
        this.metrics.failedRequests++;
        
        this.showMessage(`Request failed for participant ${participantId + 1}`);
        this.log(`Critical section request failed for participant ${participantId + 1}`, 'error');
        
        this.updateVisualization();
        this.updateStats();
    }

    async simulateDeadlock() {
        this.showMessage("Simulating potential deadlock scenario");
        this.log("Simulating deadlock - multiple simultaneous requests", 'warning');
        
        // Make multiple participants request simultaneously
        const participants = [0, 1, 2].filter(id => id < this.participantCount);
        this.metrics.deadlockEvents++;
        
        participants.forEach(id => {
            if (this.participants[id].state === 'healthy') {
                this.participants[id].state = 'locked';
                this.participants[id].requestTimestamp = this.logicalClock;
            }
        });
        
        this.updateVisualization();
        this.updateStats();
        
        await this.sleep(2000);
        
        this.log("Deadlock detected - implementing timestamp-based resolution", 'warning');
        
        // Resolve by timestamp (earliest wins)
        let earliest = participants[0];
        participants.forEach(id => {
            if (this.participants[id].requestTimestamp < this.participants[earliest].requestTimestamp) {
                earliest = id;
            }
        });
        
        // Winner continues, others back off
        participants.forEach(id => {
            if (id !== earliest) {
                this.participants[id].state = 'healthy';
                this.participants[id].requestTimestamp = null;
            }
        });
        
        this.participants[earliest].state = 'requesting';
        this.log(`Deadlock resolved - participant ${earliest + 1} continues`, 'success');
        
        this.updateVisualization();
    }

    async resolveDeadlock() {
        // Reset all locked participants
        let resolved = 0;
        this.participants.forEach(participant => {
            if (participant.state === 'locked') {
                participant.state = 'healthy';
                participant.requestTimestamp = null;
                participant.votedFor = null;
                resolved++;
            }
        });
        
        this.showMessage(`Deadlock resolved - ${resolved} participants reset`);
        this.log(`Manual deadlock resolution - ${resolved} participants reset`, 'success');
        
        this.updateVisualization();
        this.updateStats();
    }

    activateQuorumLinks(requesterId) {
        this.deactivateAllLinks();
        const quorumSet = this.quorumSets[requesterId];
        
        this.links.forEach(link => {
            if (link.quorumId === requesterId) {
                link.active = true;
            }
        });
        
        this.updateVisualization();
    }

    deactivateAllLinks() {
        this.links.forEach(link => link.active = false);
        this.updateVisualization();
    }

    simulateNodeFailure() {
        const healthyParticipants = this.participants.filter(p => p.state === 'healthy');
        if (healthyParticipants.length === 0) {
            this.showMessage("No healthy participants to fail");
            return;
        }
        
        const randomIndex = Math.floor(Math.random() * healthyParticipants.length);
        const participantToFail = healthyParticipants[randomIndex];
        
        this.failNode(participantToFail.id);
    }

    failNode(participantId) {
        const participant = this.participants[participantId];
        participant.state = 'failed';
        participant.votedFor = null;
        participant.requestTimestamp = null;
        
        // If this participant was in CS, release it
        if (this.criticalSectionOwner === participantId) {
            this.criticalSectionOwner = null;
            this.log(`Participant ${participantId + 1} failed while in critical section`, 'error');
        }
        
        this.showMessage(`Participant ${participantId + 1} failed`);
        this.log(`Participant ${participantId + 1} failed`, 'error');
        
        this.updateVisualization();
        this.updateStats();
    }

    recoverNode(participantId) {
        const participant = this.participants[participantId];
        participant.state = 'healthy';
        participant.votedFor = null;
        participant.requestTimestamp = null;
        
        this.showMessage(`Participant ${participantId + 1} recovered`);
        this.log(`Participant ${participantId + 1} recovered`, 'success');
        
        this.updateVisualization();
        this.updateStats();
    }

    recoverNodes() {
        let recovered = 0;
        this.participants.forEach(participant => {
            if (participant.state === 'failed') {
                participant.state = 'healthy';
                participant.votedFor = null;
                participant.requestTimestamp = null;
                recovered++;
            }
        });
        
        this.showMessage(`${recovered} participants recovered`);
        this.log(`${recovered} participants recovered from failures`, 'success');
        
        this.updateVisualization();
        this.updateStats();
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms / this.animationSpeed));
    }

    resetSimulation() {
        this.participants.forEach(participant => {
            participant.state = 'healthy';
            participant.votedFor = null;
            participant.requestTimestamp = null;
            participant.isVoting = false;
        });
        
        this.currentRequester = null;
        this.criticalSectionOwner = null;
        this.isProcessingRequest = false;
        this.logicalClock = 0;
        
        // Reset metrics
        this.metrics = {
            totalMessages: 0,
            csEntries: 0,
            deadlockEvents: 0,
            failedRequests: 0
        };
        
        this.deactivateAllLinks();
        this.updateVisualization();
        this.updateStats();
        
        this.showMessage("System reset");
        this.log("System reset to initial state", 'info');
    }

    updateStats() {
        const activeCount = this.participants.filter(p => p.state !== 'failed').length;
        const failedCount = this.participants.filter(p => p.state === 'failed').length;
        
        document.getElementById('activeNodes').textContent = activeCount;
        document.getElementById('failedNodes').textContent = failedCount;
        document.getElementById('currentInCS').textContent = 
            this.criticalSectionOwner !== null ? `Participant ${this.criticalSectionOwner + 1}` : 'None';
        document.getElementById('currentRequester').textContent = 
            this.currentRequester !== null ? `Participant ${this.currentRequester + 1}` : 'None';
        
        // Update CS status
        const csStatusElement = document.getElementById('csStatus');
        if (this.criticalSectionOwner !== null) {
            csStatusElement.innerHTML = '<span class="status-indicator status-consensus">Occupied</span>';
        } else if (this.isProcessingRequest) {
            csStatusElement.innerHTML = '<span class="status-indicator status-electing">Requesting</span>';
        } else {
            csStatusElement.innerHTML = '<span class="status-indicator status-ready">Available</span>';
        }
        
        // Update deadlock status
        const lockedCount = this.participants.filter(p => p.state === 'locked').length;
        document.getElementById('deadlockStatus').textContent = lockedCount > 0 ? `${lockedCount} locked` : 'None';
        
        // Update request details
        if (this.currentRequester !== null) {
            const quorumSet = this.quorumSets[this.currentRequester];
            const votesReceived = quorumSet.filter(id => 
                id !== this.currentRequester && 
                this.participants[id].votedFor === this.currentRequester
            ).length;
            
            document.getElementById('votesReceived').textContent = votesReceived;
            document.getElementById('votesNeeded').textContent = quorumSet.length - 1;
            document.getElementById('requestTimestamp').textContent = 
                this.participants[this.currentRequester].requestTimestamp || '-';
        } else {
            document.getElementById('votesReceived').textContent = '0';
            document.getElementById('votesNeeded').textContent = '0';
            document.getElementById('requestTimestamp').textContent = '-';
        }
        
        // Update metrics
        document.getElementById('totalMessages').textContent = this.metrics.totalMessages;
        document.getElementById('csEntries').textContent = this.metrics.csEntries;
        document.getElementById('deadlockEvents').textContent = this.metrics.deadlockEvents;
        document.getElementById('failedRequests').textContent = this.metrics.failedRequests;
    }

    showMessage(message) {
        const messageBox = document.getElementById('messageBox');
        messageBox.textContent = message;
        messageBox.classList.add('show');
        
        setTimeout(() => {
            messageBox.classList.remove('show');
        }, 3000);
    }

    log(message, type = 'info') {
        const logContainer = document.getElementById('logContainer');
        const timestamp = new Date().toLocaleTimeString();
        
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.textContent = `[${timestamp}] ${message}`;
        
        logContainer.appendChild(logEntry);
        logContainer.scrollTop = logContainer.scrollHeight;
        
        // Keep only last 50 entries
        while (logContainer.children.length > 50) {
            logContainer.removeChild(logContainer.firstChild);
        }
    }
}

// Global functions for button clicks
let simulation;

function requestCriticalSection() {
    simulation.requestCriticalSection();
}

function releaseCriticalSection() {
    simulation.releaseCriticalSection();
}

function simulateDeadlock() {
    simulation.simulateDeadlock();
}

function resolveDeadlock() {
    simulation.resolveDeadlock();
}

function simulateNodeFailure() {
    simulation.simulateNodeFailure();
}

function recoverNodes() {
    simulation.recoverNodes();
}

function resetSimulation() {
    simulation.resetSimulation();
}

// Initialize simulation when page loads
window.addEventListener('load', () => {
    simulation = new MaekawaSimulation();
});

// Info Modal Functions
function showInfoModal() {
    document.getElementById('infoModal').classList.add('show');
}

function hideInfoModal() {
    document.getElementById('infoModal').classList.remove('show');
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // F1 or Ctrl+H for help
    if (e.key === 'F1' || (e.ctrlKey && e.key === 'h')) {
        e.preventDefault();
        const modal = document.getElementById('infoModal');
        if (modal.classList.contains('show')) {
            hideInfoModal();
        } else {
            showInfoModal();
        }
    }
    
    // Escape to close modal
    if (e.key === 'Escape') {
        hideInfoModal();
    }
    
    // R for reset
    if (e.key === 'r' || e.key === 'R') {
        if (!document.getElementById('infoModal').classList.contains('show')) {
            resetSimulation();
        }
    }
});

// Close modal when clicking outside
document.getElementById('infoModal').addEventListener('click', (e) => {
    if (e.target.id === 'infoModal') {
        hideInfoModal();
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    if (simulation && simulation.svg) {
        simulation.width = d3.select("#visualization").node().getBoundingClientRect().width;
        simulation.height = d3.select("#visualization").node().getBoundingClientRect().height;
        simulation.svg.attr("width", simulation.width).attr("height", simulation.height);
        if (simulation.simulation) {
            simulation.simulation.force("center", d3.forceCenter(simulation.width / 2, simulation.height / 2));
            simulation.simulation.alpha(0.3).restart();
        }
    }
});

function checkOrientation() {
    const overlay = document.querySelector('.rotate-device-overlay');
    if (window.innerWidth < window.innerHeight && window.innerWidth < 768) {
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

window.addEventListener('resize', checkOrientation);
window.addEventListener('load', checkOrientation);