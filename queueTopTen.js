// NAME: Queue Top 10
// AUTHOR: Michal Stobinski
// DESCRIPTION: Adds a "Queue Top 10" button to artist pages that adds the artist's 10 most popular songs to your queue.

(async function queueTopTen() {
  // Wait until Spicetify APIs are ready
  while (
    !(window.Spicetify && Spicetify.Platform && Spicetify.URI && Spicetify.CosmosAsync && Spicetify.showNotification)
  ) {
    await new Promise((r) => setTimeout(r, 300));
  }

  const BTN_ID = "queue-top10-btn";
  const TRACK_COUNT = 10;

  // ---------- Helpers ----------

  function artistIdFromPath(pathname) {
    const m = /^\/artist\/([A-Za-z0-9]+)/.exec(pathname || "");
    return m ? m[1] : null;
  }

  function currentArtistId() {
    return artistIdFromPath(Spicetify.Platform.History?.location?.pathname);
  }

  /** Primary: Spotify's internal GraphQL (what the artist page itself uses). */
  async function topTracksViaGraphQL(artistId) {
    const gql = Spicetify.GraphQL;
    const def = gql?.Definitions?.queryArtistOverview;
    if (!gql?.Request || !def) return [];
    const res = await gql.Request(def, {
      uri: `spotify:artist:${artistId}`,
      locale: Spicetify.Locale?.getLocale?.() ?? "en",
      includePrerelease: true,
    });
    const items = res?.data?.artistUnion?.discography?.topTracks?.items ?? [];
    return items
      .filter((i) => i?.track?.uri && i.track.playability?.playable !== false)
      .map((i) => i.track.uri);
  }

  /** Fallback: public Web API. */
  async function topTracksViaWebApi(artistId) {
    const res = await Spicetify.CosmosAsync.get(
      `https://api.spotify.com/v1/artists/${artistId}/top-tracks?market=from_token`
    );
    return (res?.tracks ?? []).filter((t) => t?.uri && t.is_playable !== false).map((t) => t.uri);
  }

  async function getTopTrackUris(artistId) {
    try {
      const uris = await topTracksViaGraphQL(artistId);
      if (uris.length) return uris.slice(0, TRACK_COUNT);
    } catch (e) {
      console.warn("[Queue Top 10] GraphQL failed, falling back to Web API", e);
    }
    const uris = await topTracksViaWebApi(artistId);
    return uris.slice(0, TRACK_COUNT);
  }

  async function addUrisToQueue(uris) {
    const tracks = uris.map((uri) => ({ uri }));
    const api = Spicetify.Platform.PlayerAPI;
    if (api?.addToQueue) {
      await api.addToQueue(tracks);
    } else if (Spicetify.addToQueue) {
      await Spicetify.addToQueue(tracks);
    } else {
      throw new Error("No addToQueue API available in this Spotify/Spicetify version");
    }
  }

  async function queueTopTracks(artistId, btn) {
    if (!artistId) return;
    if (btn) btn.disabled = true;
    try {
      const uris = await getTopTrackUris(artistId);
      if (!uris.length) {
        Spicetify.showNotification("No top tracks found for this artist", true);
        return;
      }
      await addUrisToQueue(uris);
      Spicetify.showNotification(`Added ${uris.length} top track${uris.length === 1 ? "" : "s"} to queue`);
    } catch (e) {
      console.error("[Queue Top 10]", e);
      Spicetify.showNotification("Couldn't add top tracks to queue", true);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ---------- Artist page button ----------

  function createButton() {
    const btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.title = "Add this artist's 10 most popular songs to your queue";
    btn.setAttribute("aria-label", "Queue top 10 songs");
    btn.innerHTML = `
      <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style="margin-right:8px">
        <path d="M15 15H1v-1.5h14V15zm0-4.5H1V9h14v1.5zm-14-7A2.5 2.5 0 0 1 3.5 1h9a2.5 2.5 0 0 1 0 5h-9A2.5 2.5 0 0 1 1 3.5zm2.5-1a1 1 0 0 0 0 2h9a1 1 0 1 0 0-2h-9z"/>
      </svg><span>Queue Top 10</span>`;
    Object.assign(btn.style, {
      display: "inline-flex",
      alignItems: "center",
      height: "32px",
      padding: "0 16px",
      marginLeft: "16px",
      borderRadius: "500px",
      border: "1px solid var(--text-subdued, #727272)",
      background: "transparent",
      color: "var(--text-base, #fff)",
      fontSize: "14px",
      fontWeight: "700",
      cursor: "pointer",
      whiteSpace: "nowrap",
    });
    btn.addEventListener("mouseenter", () => (btn.style.borderColor = "var(--text-base, #fff)"));
    btn.addEventListener("mouseleave", () => (btn.style.borderColor = "var(--text-subdued, #727272)"));
    // Read the artist id at click time so it's always correct after in-app navigation
    btn.addEventListener("click", () => queueTopTracks(currentArtistId(), btn));
    return btn;
  }

  function injectButton() {
    if (!currentArtistId()) return;
    const bar =
      document.querySelector('[data-testid="action-bar-row"]') ||
      document.querySelector(".main-actionBar-ActionBar");
    if (!bar || bar.querySelector(`#${BTN_ID}`)) return;
    bar.appendChild(createButton());
  }

  let scheduled = false;
  function scheduleInject() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      injectButton();
    });
  }

  new MutationObserver(scheduleInject).observe(document.body, { childList: true, subtree: true });
  Spicetify.Platform.History?.listen?.(scheduleInject);
  scheduleInject();

  // ---------- Fallback: right-click menu on any artist ----------

  if (Spicetify.ContextMenu?.Item) {
    new Spicetify.ContextMenu.Item(
      "Queue top 10 songs",
      (uris) => queueTopTracks(Spicetify.URI.fromString(uris[0]).id, null),
      (uris) => uris.length === 1 && Spicetify.URI.isArtist(uris[0]),
      "queue"
    ).register();
  }
})();
