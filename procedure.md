### Experiment Controls
- **Number of Processes (N):** Total processes in the distributed system. Vary this to observe impact on message count and deadlock probability.
- **Quorum Size (K):** Approximately sqrt(N), determining how many processes must approve each request.
- **Critical Section Execution Time:** Duration a process occupies the critical section, affecting contention levels.

### Phase 1: System Setup

1. **Initialize Processes:**
   - Start N processes in the distributed system.
   - Arrange processes in a sqrt(N) x sqrt(N) grid to facilitate quorum construction.

2. **Define Quorums:**
   - For each process `Pi`, define its quorum `Si` as the union of its row and column in the grid.
   - *Why:* This ensures any two quorums share at least one process (intersection property), which prevents simultaneous critical section access.

### Phase 2: Critical Section Access Protocol

3. **Request Entry:**
   - When process `Pi` needs the critical section, it sends `REQUEST` messages to all processes in its quorum `Si`.
   - *Why:* Pi must obtain permission from its entire quorum to guarantee mutual exclusion.

4. **Process Incoming Requests:**
   - When `Pj` receives a `REQUEST` from `Pi`:
     - If `Pj` hasn't granted permission since its last `RELEASE`, send `GRANT` to `Pi`.
     - Otherwise, queue the request.
   - *Why:* Each process can grant to only one requester at a time, enforcing the mutual exclusion constraint.

5. **Enter Critical Section:**
   - Process `Pi` enters the critical section only after receiving `GRANT` from all processes in `Si`.
   - *Why:* Full quorum approval ensures no other process can simultaneously obtain permission.

6. **Release and Notify:**
   - After exiting, `Pi` sends `RELEASE` messages to all processes in its quorum.
   - *Why:* This frees quorum members to grant permission to waiting processes.

7. **Grant Queued Requests:**
   - When `Pj` receives `RELEASE` from `Pi`, it sends `GRANT` to the next process in its queue.

### Phase 3: Deadlock Prevention (Advanced)

8. **Implement Priority-Based Resolution:**
   - When `Pj` receives a request from `Pi` but has already granted to `Pk`:
     - Compare timestamps: if `Pi`'s request is earlier (higher priority), send `INQUIRE` to `Pk`.
     - If `Pk` hasn't received all grants yet, it sends `RELINQUISH` to `Pj`.
     - `Pj` then grants to `Pi` instead.
   - *Why:* This breaks circular wait chains by allowing lower-priority requests to yield to higher-priority ones.

### Phase 4: Monitoring and Analysis

9. **Collect Performance Metrics:**
   - For each critical section entry, record:
     - Total messages sent (REQUEST + GRANT + RELEASE).
     - Waiting time per process.
     - Deadlock occurrences (if any).

10. **Analyze Results:**
    - Calculate average message complexity and verify it approaches 3 * sqrt(N).
    - Compare with Lamport's (3 * (N-1)) and Ricart-Agrawala's (2 * (N-1)) algorithms.
    - Identify patterns in deadlock occurrence relative to N and concurrent request frequency.
    - *Why:* This validates the theoretical O(sqrt(N)) complexity and demonstrates the algorithm's efficiency advantages.