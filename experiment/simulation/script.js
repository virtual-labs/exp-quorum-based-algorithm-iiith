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
        // Calculate quorum size as exactly √N (rounded to nearest integer)
        this.quorumSize = Math.round(Math.sqrt(9)); // = 3 for 9 participants
        this.currentRequester = null;
        this.isProcessingRequest = false;
        this.criticalSectionOwner = null;
        this.animationSpeed = 1;
        this.logicalClock = 0;
        this.messageQueue = new Map(); // Message queues for each participant
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
            // Update quorum size to be exactly √N
            this.quorumSize = Math.round(Math.sqrt(this.participantCount));
            document.getElementById('nodeCount').textContent = this.participantCount;
            document.getElementById('quorumSize').textContent = this.quorumSize;
            this.createNetwork();
        });

        // Remove quorum slider event listener - users cannot manually change quorum size

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
                messageQueue: [], // Queue for pending requests
                hasVoted: false,
                x: Math.random() * this.width,
                y: Math.random() * this.height
            });
        }

        // Initialize message queues
        this.messageQueue.clear();
        for (let i = 0; i < this.participantCount; i++) {
            this.messageQueue.set(i, []);
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
        // Simple quorum construction with exactly √N nodes per quorum
        this.quorumSets = [];
        
        // Update the display to show current quorum size
        document.getElementById('quorumSize').textContent = this.quorumSize;
        
        // For each participant, create a quorum of exactly √N nodes
        for (let i = 0; i < this.participantCount; i++) {
            const quorumSet = [];
            
            // Add the participant itself first
            quorumSet.push(i);
            
            // Add other participants to reach exactly √N nodes
            let added = 1;
            let nodeIndex = (i + 1) % this.participantCount;
            
            while (added < this.quorumSize && added < this.participantCount) {
                if (nodeIndex !== i) { // Don't add self again
                    quorumSet.push(nodeIndex);
                    added++;
                }
                nodeIndex = (nodeIndex + 1) % this.participantCount;
            }
            
            // Sort the quorum set for consistency
            quorumSet.sort((a, b) => a - b);
            this.quorumSets.push(quorumSet);
        }

        // Log quorum sets for debugging
        this.log(`Simple quorum sets created with √N = ${this.quorumSize} nodes per quorum`, 'info');
        this.log(`Each quorum has exactly ${this.quorumSize} members`, 'info');
        this.verifyQuorumIntersection();
        this.verifyQuorumSizes();
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
            .on("click", this.nodeClicked.bind(this))
            .on("mouseenter", this.nodeMouseEnter.bind(this))
            .on("mouseleave", this.nodeMouseLeave.bind(this));

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
        this.showMessage(`Participant ${d.id + 1} clicked - Quorum: ${this.quorumSets[d.id].map(x => x + 1).join(', ')}`);
    }

    nodeMouseEnter(event, d) {
        const tooltip = document.getElementById('quorumTooltip');
        const quorumMembers = this.quorumSets[d.id].map(x => x + 1).join(', ');
        const quorumId = d.id + 1; // Quorum ID is same as participant ID in Maekawa's
        
        // Update tooltip content with quorum ID and members
        tooltip.querySelector('.tooltip-content').textContent = 
            `Participant ${d.id + 1} | Quorum ID: Q${quorumId} | Members: [${quorumMembers}] | Size: ${this.quorumSets[d.id].length}`;
        
        // Position tooltip
        const containerRect = document.getElementById('visualization').getBoundingClientRect();
        tooltip.style.left = (event.pageX - containerRect.left + 10) + 'px';
        tooltip.style.top = (event.pageY - containerRect.top - 30) + 'px';
        
        // Show tooltip
        tooltip.classList.add('show');
    }

    nodeMouseLeave(event, d) {
        const tooltip = document.getElementById('quorumTooltip');
        tooltip.classList.remove('show');
    }

    async requestCriticalSection() {
        if (this.isProcessingRequest) {
            this.showMessage("Another request is already being processed");
            return;
        }

        const selectedParticipant = parseInt(document.getElementById('participantSelector').value);
        const participant = this.participants[selectedParticipant];
        
        if (this.criticalSectionOwner !== null) {
            this.showMessage(`Critical section is currently held by Participant ${this.criticalSectionOwner + 1}`);
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
        const requester = this.participants[requesterId];
        let repliesReceived = 0;
        const repliesNeeded = quorumSet.length - 1; // Exclude self
        
        this.showMessage(`Sending REQUEST messages to quorum members`);
        this.log(`Participant ${requesterId + 1} sending REQUEST to quorum Q${requesterId + 1}: [${quorumSet.map(x => x + 1).join(', ')}]`, 'info');
        
        // Phase 1: Send REQUEST messages (√n messages)
        this.activateQuorumLinks(requesterId);
        this.metrics.totalMessages += repliesNeeded;
        
        await this.sleep(1000);
        
        // Process REQUEST messages - each quorum member decides to REPLY or queue
        const replyPromises = [];
        for (let i = 0; i < quorumSet.length; i++) {
            const memberId = quorumSet[i];
            if (memberId !== requesterId) { // Don't send to self
                replyPromises.push(this.processRequestMessage(requesterId, memberId));
            }
        }
        
        // Phase 2: Wait for REPLY messages (√n messages)
        const replies = await Promise.all(replyPromises);
        repliesReceived = replies.filter(reply => reply === true).length;
        
        this.deactivateAllLinks();
        
        this.log(`REPLY messages received: ${repliesReceived}/${repliesNeeded}`, 
                 repliesReceived === repliesNeeded ? 'success' : 'error');
        
        return repliesReceived === repliesNeeded;
    }

    async processRequestMessage(requesterId, voterId) {
        const voter = this.participants[voterId];
        const requester = this.participants[requesterId];
        
        await this.sleep(300);
        
        voter.state = 'voting';
        this.updateVisualization();
        
        await this.sleep(500);
        
        // Maekawa's algorithm logic:
        // Send REPLY if haven't voted since last RELEASE, otherwise queue the request
        if (!voter.hasVoted) {
            // Send REPLY message
            voter.hasVoted = true;
            voter.votedFor = requesterId;
            this.metrics.totalMessages++; // Count REPLY message
            
            this.log(`Participant ${voterId + 1} sends REPLY to ${requesterId + 1}`, 'success');
            
            voter.state = 'healthy';
            this.updateVisualization();
            return true;
        } else {
            // Queue the request
            voter.messageQueue.push({
                type: 'REQUEST',
                from: requesterId,
                timestamp: requester.requestTimestamp
            });
            
            this.log(`Participant ${voterId + 1} queues REQUEST from ${requesterId + 1} (already voted for ${voter.votedFor + 1})`, 'warning');
            
            voter.state = 'locked';
            this.updateVisualization();
            return false;
        }
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
        this.log(`Participant ${participantId + 1} sending RELEASE messages to quorum Q${participantId + 1}`, 'info');
        
        // Phase 3: Send RELEASE messages to quorum (√n messages)
        this.activateQuorumLinks(participantId);
        this.metrics.totalMessages += quorumSet.length - 1;
        
        await this.sleep(1000);
        
        // Process RELEASE messages - reset votes and process queues
        for (let i = 0; i < quorumSet.length; i++) {
            const memberId = quorumSet[i];
            if (memberId !== participantId) { // Don't send to self
                await this.processReleaseMessage(participantId, memberId);
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
        this.log(`Total messages for this CS access: ${3 * this.quorumSize} (3√n)`, 'info');
    }

    async processReleaseMessage(releaserId, memberId) {
        const member = this.participants[memberId];
        
        await this.sleep(200);
        
        // Reset vote if this member voted for the releaser
        if (member.votedFor === releaserId) {
            member.hasVoted = false;
            member.votedFor = null;
            member.state = 'healthy';
            
            this.log(`Participant ${memberId + 1} received RELEASE from ${releaserId + 1}`, 'info');
            
            // Process next request in queue if any
            if (member.messageQueue.length > 0) {
                const nextRequest = member.messageQueue.shift();
                this.log(`Participant ${memberId + 1} processing queued REQUEST from ${nextRequest.from + 1}`, 'info');
                
                // Send REPLY to next requester
                member.hasVoted = true;
                member.votedFor = nextRequest.from;
                this.metrics.totalMessages++; // Count REPLY message
                
                this.log(`Participant ${memberId + 1} sends REPLY to queued request from ${nextRequest.from + 1}`, 'success');
            }
            
            this.updateVisualization();
        }
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
        this.detectDeadlock();
    }

    detectDeadlock() {
        // Maekawa's deadlock detection: Check for circular waiting
        // A deadlock occurs when multiple requesters are waiting for votes from overlapping quorums
        
        const waitingRequesters = this.participants.filter(p => p.state === 'requesting' || p.state === 'locked');
        if (waitingRequesters.length < 2) {
            return false; // Need at least 2 requesters for deadlock
        }
        
        this.log(`Checking for deadlock among ${waitingRequesters.length} waiting requesters`, 'warning');
        
        // Check if any two requesters have overlapping quorums where nodes are locked
        for (let i = 0; i < waitingRequesters.length; i++) {
            for (let j = i + 1; j < waitingRequesters.length; j++) {
                const req1 = waitingRequesters[i];
                const req2 = waitingRequesters[j];
                
                const quorum1 = new Set(this.quorumSets[req1.id]);
                const quorum2 = new Set(this.quorumSets[req2.id]);
                
                // Find intersection of quorums
                const intersection = [...quorum1].filter(x => quorum2.has(x));
                
                // Check if any node in intersection is locked (has voted and has queue)
                const deadlockNodes = intersection.filter(nodeId => {
                    const node = this.participants[nodeId];
                    return node.hasVoted && node.messageQueue.length > 0;
                });
                
                if (deadlockNodes.length > 0) {
                    this.metrics.deadlockEvents++;
                    this.log(`DEADLOCK DETECTED! Participants ${req1.id + 1} and ${req2.id + 1} waiting on nodes [${deadlockNodes.map(x => x + 1).join(', ')}]`, 'error');
                    
                    // Mark nodes as locked
                    deadlockNodes.forEach(nodeId => {
                        this.participants[nodeId].state = 'locked';
                    });
                    
                    // Update UI
                    document.getElementById('deadlockStatus').textContent = 'Detected!';
                    document.getElementById('deadlockStatus').style.color = '#dc2626';
                    this.updateVisualization();
                    
                    this.showMessage(`Deadlock detected between participants ${req1.id + 1} and ${req2.id + 1}!`);
                    return true;
                }
            }
        }
        
        return false;
    }

    async simulateDeadlock() {
        if (this.isProcessingRequest) {
            this.showMessage("🚨 Another request is in progress");
            return;
        }

        this.showMessage("🚨 Initiating deadlock simulation...");
        this.log("=== DEADLOCK SIMULATION STARTED ===", 'warning');
        this.log("Purpose: Demonstrate circular waiting in Maekawa's algorithm", 'info');

        // Find two participants with overlapping quorums for realistic deadlock
        let participant1 = 0;
        let participant2 = 1;
        
        // Find participants with significant quorum overlap
        for (let i = 0; i < this.participantCount - 1; i++) {
            for (let j = i + 1; j < this.participantCount; j++) {
                const quorum1 = new Set(this.quorumSets[i]);
                const quorum2 = new Set(this.quorumSets[j]);
                const intersection = [...quorum1].filter(x => quorum2.has(x));
                
                if (intersection.length >= 2) { // Good overlap for deadlock
                    participant1 = i;
                    participant2 = j;
                    break;
                }
            }
        }

        this.log(`Selected participants ${participant1 + 1} and ${participant2 + 1} for deadlock simulation`, 'info');
        this.log(`Their quorums overlap in ${[...new Set(this.quorumSets[participant1])].filter(x => new Set(this.quorumSets[participant2]).has(x)).length} nodes`, 'info');

        // Phase 1: Simultaneous requests
        this.log("PHASE 1: Both participants request CS simultaneously", 'warning');
        this.isProcessingRequest = true;
        this.logicalClock++;

        const p1 = this.participants[participant1];
        const p2 = this.participants[participant2];
        
        p1.state = 'requesting';
        p1.requestTimestamp = this.logicalClock;
        p2.state = 'requesting'; 
        p2.requestTimestamp = this.logicalClock;

        this.updateVisualization();
        await this.sleep(1500);

        // Phase 2: Create partial voting scenario
        this.log("PHASE 2: Creating circular wait condition...", 'warning');
        
        const quorum1 = this.quorumSets[participant1];
        const quorum2 = this.quorumSets[participant2];
        const intersection = [...new Set(quorum1)].filter(x => new Set(quorum2).has(x));

        // Participant 1 gets some votes (but not all)
        let p1Votes = 0;
        for (let i = 0; i < quorum1.length; i++) {
            const voterId = quorum1[i];
            if (voterId !== participant1 && p1Votes < Math.floor(quorum1.length / 2)) {
                const voter = this.participants[voterId];
                voter.hasVoted = true;
                voter.votedFor = participant1;
                voter.state = 'voting';
                p1Votes++;
                this.log(`Node ${voterId + 1} votes for Participant ${participant1 + 1}`, 'info');
            }
        }

        await this.sleep(1000);

        // Participant 2 tries to get votes but encounters conflicts
        let p2Votes = 0;
        let conflictNodes = [];
        for (let i = 0; i < quorum2.length; i++) {
            const voterId = quorum2[i];
            if (voterId !== participant2) {
                const voter = this.participants[voterId];
                if (!voter.hasVoted && p2Votes < Math.floor(quorum2.length / 2)) {
                    voter.hasVoted = true;
                    voter.votedFor = participant2;
                    voter.state = 'voting';
                    p2Votes++;
                    this.log(`Node ${voterId + 1} votes for Participant ${participant2 + 1}`, 'info');
                } else if (voter.hasVoted) {
                    // Create deadlock: queue the request
                    voter.messageQueue.push({
                        type: 'REQUEST',
                        from: participant2,
                        timestamp: p2.requestTimestamp
                    });
                    voter.state = 'locked';
                    conflictNodes.push(voterId + 1);
                    this.log(`Node ${voterId + 1} already voted for ${voter.votedFor + 1}, queuing request from ${participant2 + 1}`, 'error');
                }
            }
        }

        this.updateVisualization();
        await this.sleep(1500);

        // Phase 3: Show deadlock detection
        this.log("PHASE 3: DEADLOCK DETECTED!", 'error');
        this.log(`Participant ${participant1 + 1}: Has ${p1Votes}/${quorum1.length - 1} votes (needs ${quorum1.length - 1})`, 'error');
        this.log(`Participant ${participant2 + 1}: Has ${p2Votes}/${quorum2.length - 1} votes (needs ${quorum2.length - 1})`, 'error');
        this.log(`Conflicted nodes: [${conflictNodes.join(', ')}]`, 'error');
        this.log("Neither participant can proceed → CIRCULAR WAIT CONDITION", 'error');

        // Mark participants as locked
        p1.state = 'locked';
        p2.state = 'locked';
        this.updateVisualization();

        // Update metrics
        this.metrics.deadlockEvents++;
        this.metrics.failedRequests += 2;

        await this.sleep(2000);

        // Phase 4: Resolution explanation
        this.log("=== DEADLOCK RESOLUTION ===", 'warning');
        this.log("In practice, deadlocks are resolved by:", 'info');
        this.log("1. Timeout mechanisms - requests expire after time limit", 'info');
        this.log("2. Timestamp ordering - lower timestamp gets priority", 'info');
        this.log("3. Prevention algorithms - careful request ordering", 'info');
        this.log("This simulation will now reset to break the deadlock", 'info');

        this.showMessage("🔄 Deadlock detected! Resetting system...");
        
        await this.sleep(2000);
        this.resetSimulation();
        
        this.log("=== DEADLOCK SIMULATION COMPLETED ===", 'success');
        this.log("Key Learning: Maekawa's algorithm can deadlock without proper prevention", 'success');
    }

    deactivateAllLinks() {
        this.links.forEach(link => link.active = false);
        this.updateVisualization();
    }

    activateQuorumLinks(participantId) {
        const quorumSet = this.quorumSets[participantId];
        this.links.forEach(link => {
            if (quorumSet.includes(link.source.id) && quorumSet.includes(link.target.id)) {
                link.active = true;
            }
        });
        this.updateVisualization();
    }

    verifyQuorumIntersection() {
        for (let i = 0; i < this.quorumSets.length; i++) {
            for (let j = i + 1; j < this.quorumSets.length; j++) {
                const intersection = this.quorumSets[i].filter(x => this.quorumSets[j].includes(x));
                if (intersection.length === 0) {
                    this.log(`CRITICAL: Quorums for ${i+1} and ${j+1} do not intersect!`, 'error');
                    return false;
                }
            }
        }
        this.log('Quorum intersection property verified successfully.', 'success');
        return true;
    }

    verifyQuorumSizes() {
        let allCorrectSize = true;
        for (let i = 0; i < this.quorumSets.length; i++) {
            const size = this.quorumSets[i].length;
            if (size !== this.quorumSize) {
                this.log(`WARNING: Quorum ${i + 1} has size ${size}, expected ${this.quorumSize}`, 'error');
                allCorrectSize = false;
            }
        }

        if (allCorrectSize) {
            this.log(`All quorums have correct size 2K-1 = ${this.quorumSize}`, 'success');
        }
        return allCorrectSize;
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
            participant.hasVoted = false;
            participant.messageQueue = [];
        });
        
        this.currentRequester = null;
        this.criticalSectionOwner = null;
        this.isProcessingRequest = false;
        this.logicalClock = 0;
        
        // Clear message queues
        this.messageQueue.clear();
        for (let i = 0; i < this.participantCount; i++) {
            this.messageQueue.set(i, []);
        }
        
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
        
        // Reset deadlock status
        document.getElementById('deadlockStatus').textContent = 'None';
        document.getElementById('deadlockStatus').style.color = '';
        
        this.showMessage("System reset");
        this.log("System reset to initial state", 'info');
    }

    updateStats() {
        const activeCount = this.participants.length;
        
        document.getElementById('activeNodes').textContent = activeCount;
        document.getElementById('currentInCS').textContent = 
            this.criticalSectionOwner !== null ? `Participant ${this.criticalSectionOwner + 1}` : 'None';
        document.getElementById('currentRequester').textContent = 
            this.currentRequester !== null ? `Participant ${this.currentRequester + 1}` : 'None';
        
        // Update CS status
        const csStatusElement = document.getElementById('csStatus');
        if (this.criticalSectionOwner !== null) {
            csStatusElement.innerHTML = `<span class="status-indicator status-no-quorum">Occupied</span>`;
        } else {
            csStatusElement.innerHTML = `<span class="status-indicator status-ready">Available</span>`;
        }
        
        // Update deadlock status
        if (document.getElementById('deadlockStatus').textContent !== 'Detected!') {
            const lockedCount = this.participants.filter(p => p.state === 'locked').length;
            document.getElementById('deadlockStatus').textContent = lockedCount > 0 ? `${lockedCount} locked` : 'None';
        }
        
        // Update request details
        if (this.currentRequester !== null) {
            const requester = this.participants[this.currentRequester];
            const quorumSet = this.quorumSets[this.currentRequester];
            const votes = requester.votes ? requester.votes.size : 0; // Defensive check
            document.getElementById('votesReceived').textContent = votes;
            document.getElementById('votesNeeded').textContent = quorumSet.length;
            document.getElementById('requestTimestamp').textContent = requester.requestTimestamp;
        } else {
            document.getElementById('votesReceived').textContent = 0;
            document.getElementById('votesNeeded').textContent = 0;
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