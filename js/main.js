import routes from "./routes.js";
import { fetchList, fetchLeaderboard, fetchPacks, fetchStaff } from "./content.js";

console.clear();

// used for cache versioning, the idea is we can use this to refresh
// the cached data if we push changes that would conflict with the old data, 
// to prevent showing a billion error messages.
export const version = 3.3
const debug = false;

export let store;

function safeDecompress(key) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
        return decompressData(raw);
    } catch (error) {
        console.warn(`Corrupt cache detected for ${key}, clearing it...`, error);
        localStorage.removeItem(key);
        return null;
    }
}

function safeCacheSet(key, value) {
    if (value === null || value === undefined) {
        localStorage.removeItem(key);
        return;
    }

    try {
        localStorage.setItem(key, compressData(value));
    } catch (error) {
        console.warn(`Failed to cache ${key}:`, error);
    }
}

// Compresses data passed to the function using Gzip
export function compressData(data) {
    const jsonData = JSON.stringify(data);
    const compressed = pako.gzip(jsonData);

    let binaryString = "";
    compressed.forEach((byte) => {
        binaryString += String.fromCharCode(byte);
    });
    return btoa(binaryString); // Convert binary to base64 for storage
}

// Decompressed data passed to the function using Gzip
export function decompressData(compressedData) {
    const binaryString = atob(compressedData); // Decode base64
    const charData = Uint8Array.from(binaryString, (char) =>
        char.charCodeAt(0)
    );
    const decompressed = pako.ungzip(charData, { to: "string" });
    return JSON.parse(decompressed);
}

if (!debug) {
    // Compare cache version
    if (localStorage.getItem("version") !== version.toString()) {
        console.warn("Cache is out of date, reloading ALL data!");
        const cookieList = await fetchList();
        if (Array.isArray(cookieList)) {
            safeCacheSet("listdata", cookieList);
        }

        const cookieLeaderboard = Array.isArray(cookieList) ? await fetchLeaderboard(cookieList) : null;
        if (Array.isArray(cookieLeaderboard)) {
            safeCacheSet("leaderboarddata", cookieLeaderboard);
        }

        const cookiePacks = Array.isArray(cookieList) ? await fetchPacks(cookieList) : null;
        if (Array.isArray(cookiePacks)) {
            safeCacheSet("packsdata", cookiePacks);
        }

        const cookieStaff = await fetchStaff();
        if (Array.isArray(cookieStaff)) {
            safeCacheSet("staffdata", cookieStaff);
        }

        localStorage.setItem('version', version.toString())
    }

    // Compress and store staff locally if it doesn't exist
    if (!localStorage.getItem("staffdata")) {
        console.warn("Staff not found in cache, refreshing...");
        const cookieStaff = await fetchStaff();
        if (Array.isArray(cookieStaff)) {
            safeCacheSet("staffdata", cookieStaff);
        }
    }

    // Compress and store list locally if it doesn't exist
    if (!localStorage.getItem("listdata")) {
        console.warn("List not found in cache, refreshing...");
        const cookieList = await fetchList();
        if (Array.isArray(cookieList)) {
            safeCacheSet("listdata", cookieList);
        }
    }

    // Compress and store leaderboard locally if it doesn't exist
    if (!localStorage.getItem("leaderboarddata")) {
        console.warn("Leaderboard not found in cache, refreshing...");
        const cookieList = safeDecompress("listdata") || await fetchList();
        const cookieLeaderboard = Array.isArray(cookieList) ? await fetchLeaderboard(cookieList) : null;

        if (Array.isArray(cookieList)) {
            safeCacheSet("listdata", cookieList);
        }
        if (Array.isArray(cookieLeaderboard)) {
            safeCacheSet("leaderboarddata", cookieLeaderboard);
        }
    }

    // Compress and store packs locally if it doesn't exist
    if (!localStorage.getItem("packsdata")) {
        console.warn("Packs not found in cache, refreshing...");
        const cookieList = safeDecompress("listdata") || await fetchList();
        const cookiePacks = Array.isArray(cookieList) ? await fetchPacks(cookieList) : null;

        if (Array.isArray(cookieList)) {
            safeCacheSet("listdata", cookieList);
        }
        if (Array.isArray(cookiePacks)) {
            safeCacheSet("packsdata", cookiePacks);
        }
    }

    // Decompress data when loading it from storage
    store = Vue.reactive({
        loaded: false,
        dark: JSON.parse(localStorage.getItem("dark")) || false,
        toggleDark() {
            this.dark = !this.dark;
            localStorage.setItem("dark", JSON.stringify(this.dark));
        },

        list: safeDecompress("listdata"),
        staff: safeDecompress("staffdata"),
        leaderboard: safeDecompress("leaderboarddata"),
        packs: safeDecompress("packsdata"),
        errors: [],
        version
    });
} else {
    const list = await fetchList();
    const leaderboard = await fetchLeaderboard(list);
    const packs = await fetchPacks(list);
    const staff = await fetchStaff();
    store = Vue.reactive({
        loaded: false,
        dark: JSON.parse(localStorage.getItem("dark")) || false,
        toggleDark() {
            this.dark = !this.dark;
            localStorage.setItem("dark", JSON.stringify(this.dark));
        },

        list,
        staff,
        packs,
        leaderboard,
        errors: [],
        version
    });
}

let app = Vue.createApp({
    data: () => ({ store, selectedColor: '' }),

    async mounted() {
        const cookieColor = localStorage.getItem("color");
        if (cookieColor) {
            this.selectedColor = cookieColor;
        }

        const submissionLink = localStorage.getItem("last_submission_link")
        

        // this looks sick u gotta admit
        if (
            submissionLink && (
                submissionLink
                    .includes("filebin")
            )
        ) localStorage
            .removeItem(
                "last_submission_link"
            );

        console.info("Pre-load completed, checking for new data...");
        store.loaded = true;
        // Update list if it's different than what's stored locally
        const updatedList = await fetchList();
        if (Array.isArray(updatedList) && JSON.stringify(updatedList) !== JSON.stringify(store.list)) {
            console.info("Found new data in list! Overwriting...");
            safeCacheSet("listdata", updatedList);
        }
        // Update staff if it's different than what's stored locally
        const updatedStaff = await fetchStaff();
        if (Array.isArray(updatedStaff) && JSON.stringify(updatedStaff) !== JSON.stringify(store.staff)) {
            console.info("Found new staff! Overwriting...");
            safeCacheSet("staffdata", updatedStaff);
        }
        // Update leaderboard if it's different than what's stored locally
        const updatedLeaderboard = Array.isArray(updatedList) ? await fetchLeaderboard(updatedList) : null;
        if (Array.isArray(updatedLeaderboard) && JSON.stringify(updatedLeaderboard) !== JSON.stringify(store.leaderboard)) {
            console.info("Found new data in leaderboard! Overwriting...");
            safeCacheSet("listdata", updatedList);
            safeCacheSet("leaderboarddata", updatedLeaderboard);
        }
        // Update packs if it's different than what's stored locally
        const updatedPacks = Array.isArray(updatedList) ? await fetchPacks(updatedList) : null;
        if (Array.isArray(updatedPacks) && JSON.stringify(updatedPacks) !== JSON.stringify(store.packs)) {
            console.info("Found new data in packs! Overwriting...");
            safeCacheSet("listdata", updatedList);
            safeCacheSet("packsdata", updatedPacks);
        }

        store.list = Array.isArray(updatedList) ? updatedList : store.list;
        store.staff = Array.isArray(updatedStaff) ? updatedStaff : store.staff;
        store.leaderboard = Array.isArray(updatedLeaderboard) ? updatedLeaderboard : store.leaderboard;
        store.packs = Array.isArray(updatedPacks) ? updatedPacks : store.packs;
        store.errors = Array.isArray(updatedLeaderboard) ? updatedLeaderboard[1] : [];
        console.info("Up to date!");
    },
    watch: {
        selectedColor: {
            handler(newColor) {
                const site = document.getElementById("app");
                // don't ask me what this does because i don't know
                const rgb = parseInt(newColor.slice(1), 16);
                const r = (rgb >> 16) & 0xff;
                const g = (rgb >> 8) & 0xff;
                const b = rgb & 0xff;
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                if (luminance > 0.5) {
                    this.store.dark = false
                    site.style.setProperty("--color-on-primary", "#000000");
                } else {
                    this.store.dark = true;
                    site.style.setProperty("--color-on-primary", "#ffffff");
                }
                site.style.setProperty("--color-primary", newColor)
                site.style.setProperty("--color-background-hover", newColor + "30")
                localStorage.setItem("color", newColor)
            }
        }
    }
});

const router = VueRouter.createRouter({history: VueRouter.createWebHashHistory(), routes});


app.use(router);
app.mount("#app");
