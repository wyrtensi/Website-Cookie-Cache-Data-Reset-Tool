document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const domainInput = document.getElementById('domainInput');
    const addDomainBtn = document.getElementById('addDomainBtn');
    const domainListUl = document.getElementById('domainList');
    const inputError = document.getElementById('inputError');
    const resetAllBtn = document.getElementById('resetAllBtn');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const listContainer = document.querySelector('.list-container'); // Get the container
    const emojiBtn = document.getElementById('emojiBtn'); // Get the emoji button

    const noDomainsLi = '<li class="no-domains">No domains added yet.</li>';
    let managedDomains = []; // Keep a local copy for easier access

    // Keep references to all buttons that might need disabling
    const allActionButtons = () => domainListUl.querySelectorAll('.action-button');

    // --- Initialization ---
    loadDomains();

    // --- Event Listeners ---
    addDomainBtn.addEventListener('click', handleAddDomain);
    domainInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleAddDomain();
        }
    });
    resetAllBtn.addEventListener('click', handleResetAll); // Add listener for Reset All

    // Add listener for the emoji button
    if (emojiBtn) {
        emojiBtn.addEventListener('click', () => {
            // Prevent adding class if animation is already running
            if (!emojiBtn.classList.contains('wobble')) {
                 emojiBtn.classList.add('wobble');

                 // Remove the class after the animation completes
                 emojiBtn.addEventListener('animationend', () => {
                     emojiBtn.classList.remove('wobble');
                 }, { once: true }); // Important: Use 'once: true' to auto-remove the listener
            }
        });
    }

    // --- Domain Management Functions ---

    async function loadDomains() {
        showLoading('Loading domains...');
        try {
            const result = await chrome.storage.sync.get(['managedDomains']);
            managedDomains = result.managedDomains || [];
            renderDomainList(managedDomains);
            await checkAllDomainStatuses(managedDomains);
        } catch (error) {
            console.error("Error loading domains:", error);
            displayError("Failed to load domains.");
            managedDomains = []; // Ensure clean state on error
            renderDomainList([]); // Render empty list
        } finally {
            hideLoading();
            // updateScrollFade(); // REMOVE OR COMMENT OUT THIS CALL
        }
    }

    async function handleAddDomain() {
        const domain = domainInput.value.trim().toLowerCase();
        clearError();

        if (!isValidDomain(domain)) {
            displayError("Please enter a valid domain (e.g., example.com)");
            return;
        }

        if (managedDomains.includes(domain)) {
            displayError(`Domain "${domain}" is already managed.`);
            return;
        }

        showLoading('Adding domain...');
        try {
            const updatedDomains = [...managedDomains, domain].sort();
            await chrome.storage.sync.set({ managedDomains: updatedDomains });
            managedDomains = updatedDomains; // Update local copy

            renderDomainList(managedDomains); // Re-render the list
            await checkDomainStatus(domain); // Await the status check here
            domainInput.value = '';
        } catch (error) {
            console.error("Error adding domain:", error);
            displayError("Failed to save domain.");
        } finally {
            hideLoading();
            // updateScrollFade(); // REMOVE OR COMMENT OUT THIS CALL
        }
    }

    async function handleDeleteDomain(domainToDelete) {
        // Optional: Add confirmation dialog?
        // if (!confirm(`Are you sure you want to remove "${domainToDelete}" from the list?`)) {
        //     return;
        // }

        showLoading(`Removing ${domainToDelete}...`);
        try {
            const updatedDomains = managedDomains.filter(d => d !== domainToDelete);
            await chrome.storage.sync.set({ managedDomains: updatedDomains });
            managedDomains = updatedDomains; // Update local copy

            // Remove the specific list item from the DOM directly
            const listItem = domainListUl.querySelector(`li[data-domain="${domainToDelete}"]`);
            if (listItem) {
                listItem.remove();
            }

            // If the list is now empty, show the placeholder message
            if (managedDomains.length === 0) {
                domainListUl.innerHTML = noDomainsLi;
                resetAllBtn.style.display = 'none';
            } else {
                 resetAllBtn.style.display = 'flex'; // Use flex
            }
             // updateScrollFade(); // REMOVE OR COMMENT OUT THIS CALL

        } catch (error) {
            console.error(`Error removing domain ${domainToDelete}:`, error);
            displayError(`Failed to remove ${domainToDelete}.`);
        } finally {
            hideLoading();
            // No need to call updateScrollFade here either if removing
        }
    }

     async function handleResetDomain(domainToReset) {
        showLoading(`Resetting data for ${domainToReset}...`);
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'deleteDomainData',
                domain: domainToReset
            });

            console.log('Reset response:', response);

            if (response && response.success) {
                // Data cleared, now update status indicator
                await checkDomainStatus(domainToReset); // Re-check status
                // Optionally show temporary success feedback on the list item
                flashListItem(domainToReset, 'success');
                console.log(`Successfully reset data for ${domainToReset}. Cookies removed: ${response.cookiesRemoved}, Data cleared: ${response.dataCleared}`);
                 if (response.errors && response.errors.length > 0) {
                     console.warn(`Partial errors during reset for ${domainToReset}:`, response.errors);
                     // Optionally display a subtle warning to the user
                 }
            } else {
                throw new Error(response?.error || 'Unknown error during reset.');
            }
        } catch (error) {
            console.error(`Error resetting domain ${domainToReset}:`, error);
            displayError(`Failed to reset data for ${domainToReset}.`);
            flashListItem(domainToReset, 'error');
        } finally {
            hideLoading();
        }
    }

    async function handleResetAll() {
         if (managedDomains.length === 0 || resetAllBtn.disabled) return; // Nothing to reset or already processing

         // Optional: Confirmation (keep if desired)
         // if (!confirm(`Are you sure you want to reset data for all ${managedDomains.length} managed domains?`)) {
         //     return;
         // }

         // --- Start Wobble and Disable ---
         // Remove overlay calls: showLoading(...) / hideLoading() are NOT used here.
         addDomainBtn.disabled = true;
         resetAllBtn.disabled = true; // Disable self
         allActionButtons().forEach(btn => btn.disabled = true); // Disable list buttons

         if (!resetAllBtn.classList.contains('wobble')) {
            resetAllBtn.classList.add('wobble');
            // Add listener to remove class when animation ends
            resetAllBtn.addEventListener('animationend', () => {
                resetAllBtn.classList.remove('wobble');
            }, { once: true });
         }
         // ---

         try {
             console.log('Reset All - Sending message...');
             const response = await chrome.runtime.sendMessage({
                 action: 'deleteAllData',
                 domains: managedDomains // Send the current list
             });
             console.log('Reset All response:', response);

             if (response && response.success) {
                 await checkAllDomainStatuses(managedDomains); // Still need to update statuses
                 console.log(`Successfully reset data for all domains.`);
                 // Flash feedback can still be used
                 Object.entries(response.results || {}).forEach(([domain, result]) => {
                    if (result.errors && result.errors.length > 0) {
                         console.warn(`Partial errors during reset for ${domain}:`, result.errors);
                         flashListItem(domain, 'warning');
                    } else {
                         flashListItem(domain, 'success');
                    }
                 });
             } else {
                 throw new Error(response?.error || 'Unknown error during reset all.');
             }
         } catch (error) {
             console.error('Error resetting all domains:', error);
             displayError('Failed to reset data for some or all domains.');
             // Try to update statuses anyway
             await checkAllDomainStatuses(managedDomains).catch(e => console.error("Error updating statuses after Reset All failure:", e));
             managedDomains.forEach(domain => flashListItem(domain, 'error'));
         } finally {
             // --- Re-enable Buttons (ensure this runs even if wobble hasn't finished) ---
             console.log('Reset All - Re-enabling buttons.');
             addDomainBtn.disabled = false;
             resetAllBtn.disabled = managedDomains.length === 0; // Re-enable based on domain count
             allActionButtons().forEach(btn => btn.disabled = false);
             // Ensure wobble class is removed if somehow stuck (unlikely with animationend listener)
             resetAllBtn.classList.remove('wobble');
             // ---
         }
    }


    function renderDomainList(domains) {
        domainListUl.innerHTML = '';

        if (domains.length === 0) {
            domainListUl.innerHTML = noDomainsLi;
            resetAllBtn.style.display = 'none';
            return;
        }

        resetAllBtn.style.display = 'flex';

        domains.forEach(domain => {
            const li = document.createElement('li');
            li.dataset.domain = domain;
            li.classList.add('domain-item-enter');

            li.innerHTML = `
                <span class="status-indicator" title="Checking cookie status..."></span>
                <span class="domain-name" title="${domain}">${domain}</span>
                <div class="domain-actions">
                    <button class="reset-btn action-button" title="Reset Data for ${domain} (and www)">
                        <span class="icon-reset">
                            <!-- NEW: Trash Bin SVG -->
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 9v10H8V9h8m-1.5-6h-5l-1 1H5v2h14V4h-3.5l-1-1zM18 7H6v12c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7z"/></svg>
                        </span>
                    </button>
                    <button class="delete-btn action-button" title="Remove ${domain} from list">
                         <span class="icon-delete">
                             <!-- NEW: Cross (X) SVG -->
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>
                         </span>
                    </button>
                </div>
            `;
            domainListUl.appendChild(li);

            // Event listeners remain the same
            li.querySelector('.reset-btn').addEventListener('click', (e) => {
                 e.stopPropagation();
                 handleResetDomain(domain);
            });
            li.querySelector('.delete-btn').addEventListener('click', (e) => {
                 e.stopPropagation();
                 handleDeleteDomain(domain);
            });

            requestAnimationFrame(() => {
                 li.classList.remove('domain-item-enter');
            });
        });
    }

    // --- Status Check Functions ---

    async function checkAllDomainStatuses(domains) {
        if (domains.length === 0) return;
        console.log("Checking status for all domains:", domains);

        // Create an array of promises, each resolving to { domain, status, error }
        const statusPromises = domains.map(domain =>
            checkDomainStatus(domain) // checkDomainStatus will now return its result
                .then(status => ({ domain, status })) // On success, return domain and status
                .catch(error => ({ domain, status: 'error', error })) // On error, mark as error status
        );

        // Wait for all checks to complete
        const results = await Promise.allSettled(statusPromises);
        console.log("Finished checking all domain statuses. Results:", results);

        // Process results and update UI
        // Note: Since checkDomainStatus now updates the UI directly,
        // this loop is mainly for logging or handling errors if needed.
        // The direct UI update within checkDomainStatus might be sufficient.
        results.forEach(result => {
             if (result.status === 'fulfilled' && result.value) {
                 const { domain, status, error } = result.value;
                 if (status === 'error') {
                     console.warn(`Status check failed for ${domain} during bulk update:`, error);
                     // UI update for error state already happened in checkDomainStatus's catch block
                 } else {
                     // UI update already happened in checkDomainStatus's try block
                     console.log(`Bulk update: Status for ${domain} is ${status}`);
                 }
             } else if (result.status === 'rejected') {
                 // This case might occur if checkDomainStatus itself has an unhandled rejection,
                 // which shouldn't happen with the current try/catch structure.
                 console.error("Unexpected rejection during status check:", result.reason);
             }
         });
    }

    async function checkDomainStatus(domain) {
        const listItem = domainListUl.querySelector(`li[data-domain="${domain}"]`);
        // If list item doesn't exist (e.g., deleted during check), exit early
        if (!listItem) {
             console.log(`List item for ${domain} not found during status check.`);
             return 'absent'; // Or throw an error? Returning absent prevents breaking Promise.all
        }

        const indicator = listItem.querySelector('.status-indicator');
        // Reset status classes immediately for visual feedback
        indicator.classList.remove('present', 'absent', 'error-state'); // Add 'error-state' if you define it
        const checkingTitle = `Checking cookie status for ${domain} (and www)...`;
        indicator.title = checkingTitle;
        // Optional: Add a 'checking' class
        // indicator.classList.add('checking');

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'checkDomainStatus',
                domain: domain
            });

             // indicator.classList.remove('checking'); // Remove checking class

            // Check if listItem still exists *after* the await
            if (!domainListUl.querySelector(`li[data-domain="${domain}"]`)) {
                 console.log(`List item for ${domain} disappeared after status check.`);
                 return 'absent'; // Domain was likely deleted
            }


            if (response && response.success) {
                indicator.classList.add(response.status); // 'present' or 'absent'
                indicator.title = response.status === 'present'
                    ? `Cookies likely present for ${domain} or www.${domain}`
                    : `No cookies found for ${domain} or www.${domain}`;
                 return response.status; // Return the status for checkAllDomainStatuses
            } else {
                throw new Error(response?.error || `Failed to get status for ${domain}`);
            }
        } catch (error) {
            console.error(`Error checking status for ${domain}:`, error);
             // indicator.classList.remove('checking'); // Remove checking class

             // Check if listItem still exists *after* the await/error
             const currentListItem = domainListUl.querySelector(`li[data-domain="${domain}"]`);
             if (currentListItem) {
                const errorIndicator = currentListItem.querySelector('.status-indicator');
                errorIndicator.classList.remove('present', 'absent'); // Ensure no misleading status
                errorIndicator.title = `Error checking cookie status for ${domain}`;
                // Optionally add an 'error' class to the indicator
                 errorIndicator.classList.add('error-state'); // Requires CSS definition for .error-state
             }
             throw error; // Re-throw error so Promise.allSettled/catch blocks can see it
        }
    }


    // --- UI Helper Functions ---

    function showLoading(message = 'Processing...') {
        loadingText.textContent = message;
        loadingOverlay.classList.add('visible');
        addDomainBtn.disabled = true;
        resetAllBtn.disabled = true;
        domainListUl.querySelectorAll('button').forEach(btn => btn.disabled = true);
    }

    function hideLoading() {
        loadingOverlay.classList.remove('visible');
        addDomainBtn.disabled = false;
        resetAllBtn.disabled = managedDomains.length === 0;
        domainListUl.querySelectorAll('button').forEach(btn => btn.disabled = false);
    }

    function displayError(message) {
        inputError.textContent = message;
        inputError.style.display = 'block';
        // Optionally auto-hide error after few seconds
        setTimeout(clearError, 5000);
    }

    function clearError() {
        inputError.textContent = '';
        inputError.style.display = 'none';
    }

     // Helper to flash list item background for feedback
     function flashListItem(domain, type = 'success') {
         const listItem = domainListUl.querySelector(`li[data-domain="${domain}"]`);
         if (!listItem) return;

         let className = '';
         if (type === 'success') className = 'flash-success';
         else if (type === 'error') className = 'flash-error';
         else if (type === 'warning') className = 'flash-warning'; // Add if needed

         if (className) {
             listItem.classList.add(className);
             setTimeout(() => {
                 listItem.classList.remove(className);
             }, 1500); // Duration of the flash
         }
     }

    // REMOVE OR COMMENT OUT THIS ENTIRE FUNCTION:
    /*
    function updateScrollFade() {
        if (!listContainer || !domainListUl) return; // Ensure elements exist

        const isScrollable = domainListUl.scrollHeight > domainListUl.clientHeight;
        if (isScrollable) {
            listContainer.classList.add('is-scrollable');
        } else {
            listContainer.classList.remove('is-scrollable');
        }
    }
    */
   // END OF REMOVAL

    // --- Utility Functions ---

    function isValidDomain(domain) {
        if (!domain || domain.includes(' ') || domain.indexOf('.') === -1) {
            return false;
        }
        if (domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
            return false;
        }
        // Very basic check for IP addresses (v4) - might need refinement
        // or could allow IPs explicitly if desired. This blocks them.
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(domain)) {
           // Maybe allow IPs? For now, let's keep it simple to "domain names"
           // return true; // Uncomment to allow IPs
           return false; // Currently disallows IPs
        }
        // Avoid protocol prefixes
        if (domain.startsWith('http:') || domain.startsWith('https:')) {
            return false;
        }
        // Could add more checks (e.g., valid TLDs), but keep it reasonably simple.
        return true;
    }

});

// Add CSS for flash feedback (append to popup.css)
/*
@keyframes flash-success {
  0%, 100% { background-color: var(--secondary-color); }
  50% { background-color: #38761d; } // Darker success green
}
@keyframes flash-error {
  0%, 100% { background-color: var(--secondary-color); }
  50% { background-color: #990000; } // Darker error red
}
@keyframes flash-warning {
  0%, 100% { background-color: var(--secondary-color); }
  50% { background-color: #b45f06; } // Darker warning orange
}

.flash-success { animation: flash-success 1.5s ease-in-out; }
.flash-error { animation: flash-error 1.5s ease-in-out; }
.flash-warning { animation: flash-warning 1.5s ease-in-out; }
*/ 