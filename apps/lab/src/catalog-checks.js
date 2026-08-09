const RESIDENCY_STORY_FORMAT = "alumbra.residency-story/1";
const RESIDENCY_EVIDENCE_FORMAT = "alumbra.residency-evidence/1";
const MATERIAL_STORY_FORMAT = "alumbra.material-story/1";
const MATERIAL_RENDER_EVIDENCE_FORMAT = "alumbra.material-render-evidence/1";
const ENVIRONMENT_EVIDENCE_FORMAT = "alumbra.environment-evidence/1";
const WORKSPACE_STORY_FORMAT = "alumbra.renderer-workspace-story/1";
const WORKSPACE_EVIDENCE_FORMAT = "alumbra.renderer-workspace-evidence/1";
const LIT_WORLD_STORY_FORMAT = "alumbra.lit-world-story/1";
const VIEWPORT_LIGHTING_EVIDENCE_FORMAT = "alumbra.viewport-lighting-evidence/1";
const MESH_LIGHT_RENDER_EVIDENCE_FORMAT = "alumbra.mesh-light-render-evidence/1";

const DEFAULT_SEED_STATE = "world/default-seed";
const NEGATIVE_COORDINATE_STATE = "world/negative-coordinate";
const PACKAGE_MISMATCH_STATE = "world/package-mismatch";
const MATERIAL_DAYLIGHT_STATE = "materials/daylight";
const MATERIAL_FOG_STATE = "materials/fog";
const MATERIAL_EMISSIVE_STATE = "materials/emissive";
const MATERIAL_UNKNOWN_STATE = "materials/unknown-profile-error";
const WORKSPACE_WIDE_STATE = "workspace/wide";
const WORKSPACE_COMPACT_STATE = "workspace/compact";
const FIXTURE_PACKAGE = "hara:greenways/alumbra-hara";
const FIXTURE_GENERATOR = "alumbra/fixture-height-field";

export const MATERIAL_STATE_IDS = Object.freeze({
  daylight: MATERIAL_DAYLIGHT_STATE,
  fog: MATERIAL_FOG_STATE,
  emissive: MATERIAL_EMISSIVE_STATE,
  unknown: MATERIAL_UNKNOWN_STATE,
});

export const WORKSPACE_STATE_IDS = Object.freeze({
  wide: WORKSPACE_WIDE_STATE,
  compact: WORKSPACE_COMPACT_STATE,
});

export const LIT_WORLD_STATE_IDS = Object.freeze({
  live: "lighting/live",
  removed: "lighting/lamp-removed",
  restored: "lighting/lamp-restored",
  stale: "lighting/stale-generation-rejected",
});

const passed = (id, label, condition) => ({
  id,
  label,
  status: condition ? "passed" : "failed",
});

function commonChecks({ activity, demo, eventLog }) {
  return [
    passed(
      "catalog/identity",
      "Activity resolves through the installed semantic identity registry",
      Boolean(demo && activity),
    ),
    passed(
      "catalog/projection",
      "Projected Catalog activity exposes no project path",
      activity?.path == null,
    ),
    passed(
      "catalog/event-boundary",
      "Catalog events contain identities but no installed project path",
      eventLog.every((event) => !Object.hasOwn(event.detail, "project")),
    ),
  ];
}

function residencyChecks({ activityId, evidence, elements, ids }) {
  const residency = evidence.residency;
  const scenario = residency?.scenario;
  if (activityId === ids.chunkResidency) {
    const initial = scenario?.initial;
    const current = scenario?.current;
    return [
      passed(
        "residency/live-surface",
        "The live prebuilt-mesh residency surface is mounted through its semantic identity",
        residency?.format === RESIDENCY_STORY_FORMAT
          && residency.activeActivity === activityId
          && residency.status === "ready"
          && scenario?.kind === "cross-boundary"
          && Boolean(elements.residencyCanvas && !elements.residencyCanvas.hidden)
          && Boolean(elements.residencyPanel && !elements.residencyPanel.hidden),
      ),
      passed(
        "residency/cross-boundary",
        "Crossing one chunk boundary replaces the bounded window and evicts resources behind it",
        initial?.format === RESIDENCY_EVIDENCE_FORMAT
          && current?.format === RESIDENCY_EVIDENCE_FORMAT
          && initial.residentChunks === initial.desiredChunks
          && current.residentChunks === current.desiredChunks
          && current.meshInstalls > initial.meshInstalls
          && current.evictedResources > initial.evictedResources
          && scenario.crossed === true
          && scenario.viewpoint?.moves >= 1
          && scenario.viewpoint?.chunk?.[0] === 1,
      ),
      passed(
        "residency/prebuilt-disposal",
        "Worker meshes install without recomputation and a GPU disposal probe returns to baseline",
        scenario?.renderer?.chunks === current?.residentChunks
          && scenario.renderer.meshResources > 0
          && scenario.renderer.materialResources > 0
          && residency.disposal?.baseline === true
          && residency.disposal.count >= 1,
      ),
    ];
  }
  const current = scenario?.current;
  return [
    passed(
      "residency/current-revision",
      "The prebuilt renderer contains only the current canonical chunk revision",
      residency?.format === RESIDENCY_STORY_FORMAT
        && residency.activeActivity === activityId
        && residency.status === "ready"
        && scenario?.kind === "stale-mesh-rejection"
        && scenario.installedRevision === 2
        && scenario.renderer?.chunks === 1
        && Boolean(elements.residencyCanvas && !elements.residencyCanvas.hidden)
        && Boolean(elements.residencyPanel && !elements.residencyPanel.hidden),
    ),
    passed(
      "residency/stale-rejection",
      "A later completion for the older revision is discarded and disposal remains exact",
      current?.format === RESIDENCY_EVIDENCE_FORMAT
        && current.meshInstalls === 1
        && current.discardedStaleJobs === 1
        && scenario.rejected === true
        && residency.disposal?.baseline === true,
    ),
  ];
}

function materialMatrixChecks({ activityId, evidence, elements }) {
  const materials = evidence.materials;
  const scenario = materials?.scenario;
  const render = scenario?.renderer?.materials;
  return [
    passed(
      "materials/live-daylight-surface",
      "The material matrix opens through its installed identity under daylight",
      materials?.format === MATERIAL_STORY_FORMAT
        && materials.activeActivity === activityId
        && materials.status === "ready"
        && scenario?.kind === "material-matrix"
        && scenario?.environment?.format === ENVIRONMENT_EVIDENCE_FORMAT
        && scenario.environment.profileId === "alumbra/daylight"
        && scenario.environment.fogMode === "none"
        && Boolean(elements.materialCanvas && !elements.materialCanvas.hidden)
        && Boolean(elements.materialPanel && !elements.materialPanel.hidden),
    ),
    passed(
      "materials/installed-passes",
      "Opaque, cutout, transparent, emissive and selection-overlay profiles render together",
      render?.format === MATERIAL_RENDER_EVIDENCE_FORMAT
        && render.profileCount === 5
        && render.opaquePassCount > 0
        && render.cutoutPassCount > 0
        && render.transparentPassCount > 0
        && render.emissivePassCount > 0
        && render.overlayPassCount > 0
        && scenario.complete === true,
    ),
    passed(
      "materials/resource-sharing",
      "Repeated chunks share bounded mesh and material resources",
      render?.materialGroupCount > render?.materialResources
        && render.sharedMeshResources > 0
        && render.sharedMaterialResources > 0
        && render.sharedResourceCount > 0,
    ),
    passed(
      "materials/disposal-baseline",
      "Material and environment resources return to baseline on disposal",
      materials.disposal?.baseline === true && materials.disposal.count >= 1,
    ),
  ];
}

function environmentChecks({ activityId, evidence, elements, requestedMaterialState }) {
  const materials = evidence.materials;
  const scenario = materials?.scenario;
  const selected = materials?.states?.[requestedMaterialState];
  const unknown = materials?.states?.[MATERIAL_UNKNOWN_STATE];
  const expected = {
    [MATERIAL_DAYLIGHT_STATE]: "alumbra/daylight",
    [MATERIAL_FOG_STATE]: "alumbra/fog",
    [MATERIAL_EMISSIVE_STATE]: "alumbra/emissive-night",
  };
  const selectedMatches = requestedMaterialState === MATERIAL_UNKNOWN_STATE
    ? selected?.status === "rejected"
      && selected.error?.code === "renderer/material-profile-not-installed"
      && selected.allocationBaseline === true
    : selected?.status === "ready"
      && selected.profileId === expected[requestedMaterialState]
      && scenario?.environment?.profileId === expected[requestedMaterialState];
  return [
    passed(
      "environment/live-installed-profile",
      "The requested installed environment state opens on the bounded material surface",
      materials?.format === MATERIAL_STORY_FORMAT
        && materials.activeActivity === activityId
        && materials.activeState === requestedMaterialState
        && materials.status === "ready"
        && scenario?.kind === "environment-profile"
        && materials.states?.[MATERIAL_DAYLIGHT_STATE]?.profileId === "alumbra/daylight"
        && materials.states?.[MATERIAL_FOG_STATE]?.profileId === "alumbra/fog"
        && materials.states?.[MATERIAL_EMISSIVE_STATE]?.profileId === "alumbra/emissive-night"
        && selectedMatches
        && Boolean(elements.materialCanvas && !elements.materialCanvas.hidden)
        && Boolean(elements.materialPanel && !elements.materialPanel.hidden),
    ),
    passed(
      "environment/missing-profile",
      "An unknown material profile fails before GPU allocation",
      unknown?.status === "rejected"
        && unknown.error?.code === "renderer/material-profile-not-installed"
        && unknown.allocationBaseline === true
        && scenario.missingProfileRejected === true,
    ),
    passed(
      "environment/evidence-and-disposal",
      "Evidence contains no shader authority and disposal returns to baseline",
      scenario.shaderSourceExposed === false
        && scenario.environment?.format === ENVIRONMENT_EVIDENCE_FORMAT
        && !Object.hasOwn(scenario.environment, "shader")
        && !Object.hasOwn(scenario.environment, "renderer")
        && materials.disposal?.baseline === true
        && materials.disposal.count >= 1,
    ),
  ];
}

function workspaceChecks({ activityId, evidence, elements, requestedWorkspaceState }) {
  const story = evidence.workspace;
  const lifecycle = story?.workspace;
  const proofs = story?.proofs;
  const expectedLayout = requestedWorkspaceState === WORKSPACE_COMPACT_STATE ? "compact" : "wide";
  const expectedSurfaces = expectedLayout === "compact"
    ? ["catalog", "world", "code", "execution", "problems"]
    : ["catalog", "world", "code", "execution", "problems", "repl"];
  const serialized = JSON.stringify(story ?? {});
  return [
    passed(
      "workspace/live-surface",
      "The integrated Hodos renderer Workspace opens through its installed identity",
      story?.format === WORKSPACE_STORY_FORMAT
        && story.activeActivity === activityId
        && story.activeState === requestedWorkspaceState
        && story.status === "ready"
        && lifecycle?.format === WORKSPACE_EVIDENCE_FORMAT
        && lifecycle.layout === expectedLayout
        && lifecycle.activeSurfaceId === "world"
        && Boolean(elements.workspaceShell && !elements.workspaceShell.hidden)
        && Boolean(elements.workspaceCanvas && !elements.workspaceCanvas.hidden),
    ),
    passed(
      "workspace/model-reuse",
      "Ordinary model changes preserve the same engine, session and canonical world",
      proofs?.modelUpdatePreserved === true
        && lifecycle.modelUpdates === 1
        && lifecycle.createdHosts === 2,
    ),
    passed(
      "workspace/hidden-suspends",
      "Hiding the World surface suspends the active viewport host",
      proofs?.hiddenWorldSuspended === true
        && lifecycle.suspendedHosts >= 1,
    ),
    passed(
      "workspace/return-resumes",
      "Returning to World resumes the same canonical world and engine",
      proofs?.resumedSameWorld === true
        && lifecycle.resumedHosts >= 1
        && lifecycle.viewportStatus === "active",
    ),
    passed(
      "workspace/activity-disposal",
      "Switching installed activities destroys the previous viewport before creating the next",
      proofs?.activitySwitchDisposedPrevious === true
        && lifecycle.activitySwitches === 1
        && lifecycle.destroyedHosts === 1
        && story.disposal?.baseline === true,
    ),
    passed(
      "workspace/separate-authorities",
      "Catalog, World, Code, Execution, Problems and REPL remain separate bounded authorities",
      proofs?.separateAuthorities === true
        && lifecycle.authorityIds?.length === 6
        && new Set(lifecycle.authorityIds).size === 6
        && JSON.stringify(lifecycle.visibleSurfaceIds) === JSON.stringify(expectedSurfaces)
        && proofs?.requestedLayoutProjected === true,
    ),
    passed(
      "workspace/bounded-evidence",
      "Workspace evidence contains identities and lifecycle counts but no renderer or project authority",
      proofs?.boundedEvidence === true
        && !serialized.includes("projectPath")
        && !serialized.includes("shaderSource")
        && !serialized.includes("meshBuffer")
        && !serialized.includes("callback")
        && !serialized.includes("PlayCanvas"),
    ),
  ];
}

function litWorldChecks({ activityId, evidence, elements, requestedLitWorldState }) {
  const story = evidence.litWorld;
  const scenario = story?.scenario;
  const lighting = scenario?.lighting;
  const materialLighting = scenario?.materials?.lighting;
  const mutation = scenario?.mutation;
  const receipts = mutation?.receipts ?? [];
  const stale = mutation?.stale;
  const serialized = JSON.stringify(story ?? {});
  const expectedMutation = requestedLitWorldState === LIT_WORLD_STATE_IDS.live
    ? receipts.length === 0
    : requestedLitWorldState === LIT_WORLD_STATE_IDS.removed
      ? receipts.length === 1
        && mutation?.current?.lampPresent === false
        && mutation?.current?.boundaryEmission === 0
      : requestedLitWorldState === LIT_WORLD_STATE_IDS.restored
        ? receipts.length === 2
          && mutation?.phases?.some((phase) => phase.id === LIT_WORLD_STATE_IDS.removed
            && phase.lampPresent === false
            && phase.boundaryEmission === 0)
          && mutation?.current?.lampPresent === true
          && mutation?.current?.boundaryEmission > 0
        : requestedLitWorldState === LIT_WORLD_STATE_IDS.stale
          ? receipts.length === 2
            && stale?.rejected === true
            && stale.discardedAfter > stale.discardedBefore
            && stale.finalRequestedGeneration === stale.finalInstalledGeneration
            && mutation?.current?.lampPresent === true
            && mutation?.current?.installedFieldRevision === mutation?.current?.lampChunkRevision
          : false;
  return [
    passed(
      "lit-world/live-surface",
      "The selected lit-world state opens through its installed semantic identity",
      story?.format === LIT_WORLD_STORY_FORMAT
        && story.activeActivity === activityId
        && story.activeState === requestedLitWorldState
        && story.status === "ready"
        && scenario?.kind === "lit-world"
        && scenario.stateId === requestedLitWorldState
        && Boolean(elements.litWorldCanvas && !elements.litWorldCanvas.hidden)
        && Boolean(elements.litWorldPanel && !elements.litWorldPanel.hidden),
    ),
    passed(
      "lit-world/canonical-mutation",
      "Accepted Core transactions produce the expected bounded lighting state",
      lighting?.format === VIEWPORT_LIGHTING_EVIDENCE_FORMAT
        && lighting.status === "ready"
        && lighting.loadedChunks === 2
        && lighting.installedChunks === 2
        && scenario.world?.negativeToZero === true
        && scenario.proofs?.expectedState === true
        && scenario.proofs?.boundedAffected === true
        && scenario.proofs?.duplicateActionRejected === true
        && expectedMutation,
    ),
    passed(
      "lit-world/vertex-colour-projection",
      "Every current lit mesh vertex has aligned renderer-owned colour projection",
      materialLighting?.format === MESH_LIGHT_RENDER_EVIDENCE_FORMAT
        && materialLighting.litGroupCount > 0
        && materialLighting.vertices > 0
        && materialLighting.vertices === lighting.lastMesh?.vertices
        && scenario.proofs?.alignedVertexColors === true,
    ),
    passed(
      "lit-world/lifecycle-and-fence",
      "Visibility retains the canonical session and obsolete lighting work cannot install",
      scenario.proofs?.sameCanonicalSessionAfterResume === true
        && scenario.proofs?.staleGenerationRejected === true
        && story.lifecycle?.suspensions >= 1
        && story.lifecycle?.resumes >= 1
        && scenario.session?.status === "active"
        && scenario.session?.worldId === scenario.world?.id
        && lighting.dirtyChunks === 0,
    ),
    passed(
      "lit-world/bounded-disposal",
      "Evidence stays bounded and a real lighting/GPU disposal probe returns to baseline",
      story.disposal?.baseline === true
        && story.disposal.count >= 1
        && scenario.proofs?.boundedEvidence === true
        && !serialized.includes("Uint8Array")
        && !serialized.includes("meshBuffer")
        && !serialized.includes("callback")
        && !serialized.includes("PlayCanvas")
        && !serialized.includes("projectPath")
        && !serialized.includes("capability"),
    ),
  ];
}

function haraChecks({ evidence, elements, requestedHaraState }) {
  const packaged = evidence.packagedWorld;
  const defaultWorld = packaged?.states?.[DEFAULT_SEED_STATE];
  const negativeWorld = packaged?.states?.[NEGATIVE_COORDINATE_STATE];
  const mismatch = packaged?.states?.[PACKAGE_MISMATCH_STATE];
  const negativeSnapshot = negativeWorld?.snapshots?.[0];
  const active = packaged?.active;
  return [
    passed(
      "hara/package-identity",
      "The exact Hara package identity is pinned and mismatches fail closed",
      defaultWorld?.package?.coordinate === FIXTURE_PACKAGE
        && defaultWorld.package.matched === true
        && mismatch?.status === "rejected"
        && mismatch.error?.code === "hara/package-version-mismatch",
    ),
    passed(
      "hara/generator-identity",
      "The packaged generator identity is preserved across named states",
      defaultWorld?.generator?.id === FIXTURE_GENERATOR
        && defaultWorld.generator.matched === true
        && negativeWorld?.generator?.id === FIXTURE_GENERATOR
        && negativeWorld.generator.matched === true,
    ),
    passed(
      "hara/snapshot-digest",
      "Core materialization matches the immutable default snapshot digest",
      defaultWorld?.snapshots?.length === 1
        && defaultWorld.snapshots[0].matched === true
        && defaultWorld.snapshots[0].digest === defaultWorld.snapshots[0].expectedDigest,
    ),
    passed(
      "hara/negative-coordinate-parity",
      "Negative-coordinate generation matches the pinned snapshot evidence",
      negativeWorld?.negativeCoordinateParity === true
        && negativeSnapshot?.matched === true
        && negativeSnapshot.coord.some((entry) => entry < 0),
    ),
    passed(
      "hara/disposal-baseline",
      "A packaged-world viewport returns renderer resources to baseline on disposal",
      packaged?.disposal?.baseline === true && packaged.disposal.count >= 1,
    ),
    passed(
      "hara/active-state",
      "The requested named state is projected without leaking runtime handles",
      packaged?.activeState === requestedHaraState
        && (active?.status === "ready"
          ? Boolean(elements.haraCanvas && !elements.haraCanvas.hidden)
          : active?.status === "rejected"
            && Boolean(elements.packagedWorldError && !elements.packagedWorldError.hidden)),
    ),
  ];
}

function viewportChecks({ activityId, evidence, elements, ids }) {
  const checks = [passed(
    "viewport/canvas",
    "The installed PlayCanvas viewport surface is mounted",
    Boolean(elements.primaryCanvas),
  )];
  if (activityId === ids.playableWorld) {
    const primary = evidence.sessions.find((session) => session.sessionId === "primary");
    checks.push(passed(
      "viewport/canonical-session",
      "One active viewport retains its canonical world identity",
      evidence.activeActivity === activityId
        && evidence.mode === "single"
        && primary?.status === "active"
        && typeof primary.worldId === "string",
    ));
  } else if (activityId === ids.twoSessions) {
    const sessions = evidence.sessions.filter((session) => session.status === "active");
    checks.push(
      passed(
        "viewport/session-count",
        "Two active viewport sessions are projected together",
        evidence.activeActivity === activityId
          && evidence.mode === "two"
          && sessions.length === 2
          && Boolean(elements.secondaryCanvas && !elements.secondaryCanvas.hidden),
      ),
      passed(
        "viewport/session-identity",
        "Viewport session identities remain distinct",
        new Set(sessions.map((session) => session.sessionId)).size === 2,
      ),
      passed(
        "viewport/world-identity",
        "Canonical world identities remain independent",
        new Set(sessions.map((session) => session.worldId)).size === 2,
      ),
    );
  }
  return checks;
}

export function buildCatalogChecks({
  activityId,
  activity,
  demo,
  eventLog,
  evidence,
  elements,
  ids,
  requestedHaraState,
  requestedMaterialState,
  requestedWorkspaceState,
  requestedLitWorldState,
}) {
  const checks = commonChecks({ activity, demo, eventLog });
  if (activityId === ids.litWorld) {
    checks.push(...litWorldChecks({ activityId, evidence, elements, requestedLitWorldState }));
  } else if (activityId === ids.rendererWorkspace) {
    checks.push(...workspaceChecks({ activityId, evidence, elements, requestedWorkspaceState }));
  } else if (ids.residencyActivities.has(activityId)) {
    checks.push(...residencyChecks({ activityId, evidence, elements, ids }));
  } else if (activityId === ids.materialMatrix) {
    checks.push(...materialMatrixChecks({ activityId, evidence, elements }));
  } else if (activityId === ids.environmentProfile) {
    checks.push(...environmentChecks({
      activityId,
      evidence,
      elements,
      requestedMaterialState,
    }));
  } else if (activityId === ids.packagedHara) {
    checks.push(...haraChecks({ evidence, elements, requestedHaraState }));
  } else if (demo.host === "playable-lab") {
    checks.push(...viewportChecks({ activityId, evidence, elements, ids }));
  }
  return Object.freeze({
    status: checks.every((check) => check.status === "passed") ? "passed" : "failed",
    message: `${checks.filter((check) => check.status === "passed").length}/${checks.length} activity checks passed`,
    checks: Object.freeze(checks),
  });
}
