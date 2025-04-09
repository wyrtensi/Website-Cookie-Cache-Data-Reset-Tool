// --- Constants for Data Types ---
const DATA_TYPES_TO_REMOVE = {
    cookies: true,
    cacheStorage: true, // Covers Cache API, Service Worker caches
    localStorage: true,
    indexedDB: true,
    webSQL: true,       // Deprecated but might still hold data
    cache: true,        // Browser's HTTP cache
    serviceWorkers: true, // Add service worker unregistration
    // 'fileSystems', 'serviceWorkers' // Consider if needed, potentially disruptive
};

// --- Message Listener ---
// Listens for messages from popup.js or other extension parts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Background received message:", request);

    // Use a switch or if/else if to handle different message types
    if (request.action === "checkDomainStatus") {
        handleCheckDomainStatus(request.domain)
            .then(status => sendResponse({ success: true, status }))
            .catch(error => {
                console.error(`Error checking status for ${request.domain}:`, error);
                sendResponse({ success: false, error: error.message });
            });
        return true; // Indicates that the response is sent asynchronously
    }

    if (request.action === "deleteDomainData") {
         handleDeleteDomainData(request.domain)
             .then(result => sendResponse({ success: true, ...result }))
             .catch(error => {
                 console.error(`Error deleting data for ${request.domain}:`, error);
                 sendResponse({ success: false, error: error.message });
             });
         return true; // Async response
    }

     if (request.action === "deleteAllData") {
         handleDeleteAllData(request.domains)
             .then(results => sendResponse({ success: true, results }))
             .catch(error => {
                 console.error("Error deleting data for all domains:", error);
                 sendResponse({ success: false, error: error.message });
             });
         return true; // Async response
     }

    // Add handlers for other actions if needed

    // If the message isn't handled, return false or undefined
    console.log("Unknown message action:", request.action);
    // sendResponse({ success: false, error: "Unknown action" }); // Optionally send an error for unhandled actions
    return false; // No async response planned for unknown actions
});


// --- Action Handlers ---

/**
 * Checks if any cookies exist for the given domain OR its www. subdomain.
 * This provides a slightly more comprehensive status check based on cookies.
 */
async function handleCheckDomainStatus(domain) {
    console.log(`Checking cookie status for: ${domain} (and www)`);
    try {
        let hasCookies = false;
        const domainsToCheck = [domain];
         if (!domain.startsWith('www.')) {
             domainsToCheck.push(`www.${domain}`);
         }

        for (const d of domainsToCheck) {
            // Check cookies for each domain/subdomain variation
             const cookies = await chrome.cookies.getAll({ domain: d });
             if (cookies && cookies.length > 0) {
                 hasCookies = true;
                 console.log(`Cookies found matching ${d}`);
                 break; // Found cookies, no need to check further
             }
        }

        console.log(`Overall cookie presence for ${domain} (incl. www): ${hasCookies}`);
        return hasCookies ? 'present' : 'absent';
    } catch (error) {
        console.error(`Failed to get cookies for ${domain} or www.${domain}:`, error);
        return 'absent'; // Treat errors as 'absent' for simplicity
    }
}

/**
 * Deletes cookies and browsing data associated with a specific domain,
 * including its common 'www.' subdomain. Tries to be more aggressive.
 */
async function handleDeleteDomainData(domain) {
    console.log(`Attempting to delete data for: ${domain} (and www)`);
    const results = {
        cookiesRemoved: 0,
        dataCleared: false,
        errors: []
    };
    const domainsToCheck = [domain];
    // Add www. version unless the domain already starts with www.
    if (!domain.startsWith('www.')) {
        domainsToCheck.push(`www.${domain}`);
    }

    try {
        // 1. Remove Cookies for base domain and www. subdomain
        let cookieRemovalPromises = [];
        let foundCookies = [];

        for (const d of domainsToCheck) {
             try {
                 // Fetch cookies specifically for this domain/subdomain
                 const cookies = await chrome.cookies.getAll({ domain: d });
                 if (cookies && cookies.length > 0) {
                     console.log(`Found ${cookies.length} cookies matching domain: ${d}`);
                     // Add unique cookies to the list to be removed
                     cookies.forEach(cookie => {
                         // Check if we already targeted this cookie (avoids duplicates if getAll finds same cookie for domain and www.domain)
                         if (!foundCookies.some(c => c.name === cookie.name && c.storeId === cookie.storeId && c.path === cookie.path && c.domain === cookie.domain)) {
                             foundCookies.push(cookie);
                         }
                     });
                 }
             } catch (cookieError) {
                  console.warn(`Error fetching cookies for ${d}:`, cookieError);
                  results.errors.push(`Fetching cookies (${d}): ${cookieError.message}`);
             }
        }

        console.log(`Total unique cookies to remove for ${domain} (incl. www): ${foundCookies.length}`);
        foundCookies.forEach(cookie => {
            // Construct the cookie URL based on protocol and domain
            let cookieUrl = `${cookie.secure ? 'https' : 'http'}://${cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain}${cookie.path}`;

            console.log(`Removing cookie: ${cookie.name} from ${cookieUrl}`);
            cookieRemovalPromises.push(
                chrome.cookies.remove({ url: cookieUrl, name: cookie.name, storeId: cookie.storeId })
                    .then(details => {
                        if (details) {
                            results.cookiesRemoved++;
                        } else {
                            console.warn(`Could not remove cookie (details null): ${cookie.name} @ ${cookieUrl}`);
                        }
                    })
                    .catch(err => {
                        console.warn(`Error removing cookie ${cookie.name} from ${cookieUrl}:`, err);
                        results.errors.push(`Cookie ${cookie.name}: ${err.message}`);
                    })
            );
        });

        await Promise.all(cookieRemovalPromises);
        console.log(`Finished removing cookies for ${domain} (incl. www). Count: ${results.cookiesRemoved}`);

        // 2. Remove Browsing Data (Cache, Local Storage, Service Workers, etc.) for the origins
        const origins = [
            `http://${domain}`, `https://${domain}`
        ];
        if (!domain.startsWith('www.')) {
             origins.push(`http://www.${domain}`, `https://www.${domain}`);
        }

        console.log(`Attempting to clear browsing data for origins: ${origins.join(', ')} with types:`, Object.keys(DATA_TYPES_TO_REMOVE));

        try {
            await new Promise((resolve, reject) => {
                chrome.browsingData.remove({ origins: origins }, DATA_TYPES_TO_REMOVE, () => {
                    // Check chrome.runtime.lastError INSIDE the callback
                    if (chrome.runtime.lastError) {
                        console.error(`Error during chrome.browsingData.remove for ${domain}:`, chrome.runtime.lastError.message);
                        reject(new Error(chrome.runtime.lastError.message)); // Reject the promise
                    } else {
                        console.log(`Callback received for chrome.browsingData.remove for ${domain} - Success.`);
                        resolve(); // Resolve the promise
                    }
                });
            });
            // If the promise resolved without error:
            results.dataCleared = true;
            console.log(`Browsing data removal successfully completed via callback for ${domain} origins (incl. www)`);

        } catch (browsingDataError) {
            // Catch errors from the promise (rejected due to lastError or other issues)
            console.error(`Caught error during browsing data removal process for ${domain}:`, browsingDataError);
            results.errors.push(`Browsing data removal: ${browsingDataError.message || browsingDataError}`);
            results.dataCleared = false; // Ensure this is false on error
        }

    } catch (error) {
        console.error(`Error during data removal process for ${domain}:`, error);
        results.errors.push(`Browsing data removal: ${error.message || error}`);
        // Data cleared might be false if the error came from browsingData.remove
        results.dataCleared = false;
    }

    console.log(`Deletion results for ${domain}:`, results);
    return results; // Return detailed results including errors
}

/**
 * Iterates through a list of domains and deletes data for each.
 */
async function handleDeleteAllData(domains) {
    console.log("Attempting to delete data for all managed domains:", domains);
    const allResults = {};
    // Run deletions sequentially to avoid overwhelming the browser/API? Or parallel?
    // Let's run sequentially for now, might be less error-prone.
    for (const domain of domains) {
        // Don't await here if we want parallel, but manage promises then.
         allResults[domain] = await handleDeleteDomainData(domain);
    }
    console.log("Finished deleting data for all domains. Results:", allResults);
    return allResults;
}


// Optional: Log when the service worker starts
console.log("Background service worker started.");

// Optional: Keep service worker alive briefly if needed for async ops immediately after startup
// (Generally not needed with Manifest V3 event-driven model, but sometimes useful for debugging)
// chrome.runtime.onStartup.addListener(() => {
//   console.log("Extension started up.");
// }); 