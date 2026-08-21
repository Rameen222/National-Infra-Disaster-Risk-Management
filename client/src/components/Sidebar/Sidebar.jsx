import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { PROVINCES } from '../../config/mapConfig';
import FloodLayersPanel from './FloodLayersPanel';
import EncroachmentLayersPanel from './EncroachmentLayersPanel';
import SusceptibilityStyleModal from './SusceptibilityStyleModal';
import RiskCalculatorModal from '../RiskCalculator/RiskCalculatorModal';
import useDrag from '../../hooks/useDrag';
import './Sidebar.css';

/* ── District Modal (glassmorphism overlay) ──────────── */
function DistrictModal({ province, districts, selectedDistrict, onDistrictClick, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const { pos, onMouseDown } = useDrag(264, 48);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? districts.filter((d) => d.toLowerCase().includes(q)) : districts;
  }, [districts, query]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Auto-focus search
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div className="dm-overlay">
      <div className="dm-panel" style={{ left: pos.x, top: pos.y }}>
        {/* Animated light streaks from multiple directions */}
        <div className="dm-streak dm-streak--1" />
        <div className="dm-streak dm-streak--2" />
        <div className="dm-streak dm-streak--3" />

        <div className="dm-header" onMouseDown={onMouseDown} style={{ cursor: 'grab' }}>
          <div className="dm-header-left">
            <span className="dm-badge">Select District</span>
            <h3 className="dm-title">{province.name}</h3>
          </div>
          <button className="dm-close" onClick={onClose}>✕</button>
        </div>

        <div className="dm-search-wrap">
          <svg className="dm-search-icon" width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            className="dm-search"
            type="text"
            placeholder="Search districts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="dm-search-clear" onClick={() => setQuery('')}>✕</button>
          )}
        </div>

        <div className="dm-count">
          {filtered.length} district{filtered.length !== 1 ? 's' : ''}
        </div>

        <div className="dm-grid">
          {filtered.map((d, i) => (
            <div
              key={d}
              className={`dm-item${selectedDistrict === d ? ' dm-item--active' : ''}`}
              style={{ animationDelay: `${Math.min(i * 0.018, 0.35)}s` }}
              onClick={(e) => onDistrictClick(e, d)}
            >
              <span className="dm-item-dot" data-color={i % 6} />
              <span className="dm-item-name">{d}</span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="dm-empty">No districts match &ldquo;{query}&rdquo;</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Sidebar({ selectedProvince, selectedDistrict, onProvinceSelect, onDistrictSelect, collapsed, onToggleCollapse, districtsGeoJSON, isNationalView, onNationalSelect, floodLayers, onFloodLayerUpdate, onFloodLayerReorder, districtData, encroachmentLayers, onEncroachmentLayerUpdate, onEncroachmentLayerReorder, onOpenEncroachment, encroachmentEnabled, onOpenExposure, exposureActive, onOpenGCOPExposure, gcopExposureActive, onOpenFloodProjection }) {
  // Flood Projections 2026 is "enabled" when its layer is toggled on.
  const floodProjectionEnabled = floodLayers.some((l) => l.year === 'proj-2026' && l.visible);
  const [districtModalProvince, setDistrictModalProvince] = useState(null);
  const [districtQuery, setDistrictQuery] = useState('');
  const [floodOpen, setFloodOpen] = useState(false);
  const [encroachOpen, setEncroachOpen] = useState(false);
  const [susOpen, setSusOpen] = useState(false);
  const [susStyleOpen, setSusStyleOpen] = useState(false);
  const [riskCalcOpen, setRiskCalcOpen] = useState(false);
  const districtInputRef = useRef(null);
  const districtListRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef(null);

  // Build { geojsonProvince: [districtName, ...] } from GeoJSON, sorted alphabetically
  const districtsByProvince = useMemo(() => {
    if (!districtsGeoJSON) return {};
    const map = {};
    districtsGeoJSON.features.forEach((f) => {
      const prov = f.properties.province;
      const name = f.properties.name;
      if (!map[prov]) map[prov] = new Set();
      map[prov].add(name);
    });
    const sorted = {};
    Object.keys(map).forEach((k) => {
      sorted[k] = Array.from(map[k]).sort();
    });
    return sorted;
  }, [districtsGeoJSON]);

  const handleProvinceClick = (province) => {
    onProvinceSelect(province.id);
    const districts = districtsByProvince[province.geojsonProvince] || [];
    if (districts.length > 0) {
      setDistrictModalProvince((prev) => prev?.id === province.id ? null : province);
      setDistrictQuery('');
    } else {
      setDistrictModalProvince(null);
    }
  };

  const handleDistrictClick = (e, districtName, province) => {
    e.stopPropagation();
    onProvinceSelect(province.id);
    onDistrictSelect(districtName);
  };

  // Districts for the currently selected province
  const activeDistricts = useMemo(() => {
    if (!districtModalProvince) return [];
    const all = districtsByProvince[districtModalProvince.geojsonProvince] || [];
    if (!districtQuery) return all;
    const q = districtQuery.toLowerCase();
    return all.filter((d) => d.toLowerCase().includes(q));
  }, [districtModalProvince, districtsByProvince, districtQuery]);

  // Load more districts on scroll (groups of 4) with brief loading indicator
  const handleDistrictScroll = useCallback(() => {
    const el = districtListRef.current;
    if (!el || loadingMore) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      setLoadingMore(true);
      setTimeout(() => {
        setVisibleCount((prev) => prev + 4);
        setLoadingMore(false);
      }, 400);
    }
  }, [loadingMore]);

  // Reset when province changes
  useEffect(() => {
    setDistrictQuery('');
    setVisibleCount(8);
  }, [districtModalProvince]);

  return (
    <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
      {/* Sidebar light streaks */}
      <div className="dm-streak dm-streak--1" />
      <div className="dm-streak dm-streak--2" />
      <div className="dm-streak dm-streak--3" />

      <div className="sidebar-header">
        <button
          className={`hamburger-btn${collapsed ? '' : ' is-open'}`}
          onClick={onToggleCollapse}
          title={collapsed ? 'Open sidebar' : 'Close sidebar'}
          aria-label="Toggle sidebar"
        >
          <span />
          <span />
          <span />
        </button>
        {!collapsed && <span>NAVIGATION</span>}
      </div>

      {!collapsed && (
        <div
          className={`national-row${isNationalView ? ' selected' : ''}`}
          onClick={onNationalSelect}
        >
          <span className="national-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
              <path d="M9.5 6C7.01 7.5 5.5 10.1 5.5 13c0 2.9 1.51 5.5 4 7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
              <path d="M15.5 8.5l.6 1.2 1.3.2-1 .9.2 1.3-1.1-.6-1.1.6.2-1.3-1-.9 1.3-.2.6-1.2z" fill="currentColor"/>
            </svg>
          </span>
          <span className="national-name">National</span>
        </div>
      )}

      {!collapsed && <div className="sidebar-label">Administrative Units</div>}

      <div className="province-list" style={{ display: collapsed ? 'none' : '' }}>
        {/* District Browser Section — directly below National / Admin Units heading */}
        <div className="sidebar-district-section">
          {districtModalProvince ? (
            <>
              <div className="sidebar-district-header">
                <span className="sidebar-district-title">{districtModalProvince.name} Districts</span>
              </div>
              <div className="sidebar-district-search">
                <input
                  ref={districtInputRef}
                  type="text"
                  placeholder="Search districts…"
                  value={districtQuery}
                  onChange={(e) => {
                    setDistrictQuery(e.target.value);
                    setVisibleCount(8);
                    if (e.target.value) {
                      setSearchLoading(true);
                      clearTimeout(searchTimerRef.current);
                      searchTimerRef.current = setTimeout(() => setSearchLoading(false), 350);
                    } else {
                      setSearchLoading(false);
                      clearTimeout(searchTimerRef.current);
                    }
                  }}
                  className="sidebar-district-input"
                />
                {districtQuery && (
                  <button className="sidebar-district-clear" onClick={() => setDistrictQuery('')}>✕</button>
                )}
              </div>
              <div className="sidebar-district-items" ref={districtListRef} onScroll={handleDistrictScroll}>
                {searchLoading ? (
                  <div className="sidebar-district-loading">
                    <span className="sidebar-district-spinner" />
                    <span>Searching…</span>
                  </div>
                ) : (
                  <>
                    {activeDistricts.slice(0, visibleCount).map((d) => (
                      <div
                        key={d}
                        className={`sidebar-district-item${selectedDistrict === d ? ' sidebar-district-item--active' : ''}`}
                        onClick={(e) => handleDistrictClick(e, d, districtModalProvince)}
                      >
                        {d}
                      </div>
                    ))}
                    {activeDistricts.length === 0 && districtQuery && (
                      <div className="sidebar-district-empty">No districts match "{districtQuery}"</div>
                    )}
                    {loadingMore && (
                      <div className="sidebar-district-loading">
                        <span className="sidebar-district-spinner" />
                        <span>Loading…</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="sidebar-district-placeholder">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                <rect x="9" y="9" width="2" height="2" rx="0.5" fill="currentColor"/>
                <rect x="13" y="9" width="2" height="2" rx="0.5" fill="currentColor"/>
              </svg>
              <span>Select a province to browse districts</span>
            </div>
          )}
        </div>

        {PROVINCES.map((province) => {
          const isSelected = selectedProvince === province.id;
          const districts = districtsByProvince[province.geojsonProvince] || [];

          return (
            <div key={province.id} className="province-item">
              <div
                className={`province-row ${isSelected ? 'selected' : ''}`}
                onClick={() => handleProvinceClick(province)}
                style={{ '--prov-color': province.color }}
              >
                <span className={`tree-icon${districtModalProvince?.id === province.id ? ' tree-icon--open' : ''}`}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M3.5 2L6.5 5L3.5 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="province-name">{province.name}</span>
              </div>
            </div>
          );
        })}

        {/* ── Layer accordions ──────────────────────────── */}
        <button
          className="sidebar-accordion-header sidebar-accordion-header--flood"
          onClick={() => setFloodOpen((v) => !v)}
        >
          <svg
            className={`accordion-chevron${floodOpen ? ' accordion-chevron--open' : ''}`}
            width="12" height="12" viewBox="0 0 12 12" fill="none"
          >
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Flood Layers</span>
        </button>
        {floodOpen && (
          <>
            <FloodLayersPanel
              floodLayers={floodLayers.filter((l) => !l.year.startsWith('sus-'))}
              onFloodLayerUpdate={onFloodLayerUpdate}
              onFloodLayerReorder={(reordered) => {
                const susLayers = floodLayers.filter((l) => l.year.startsWith('sus-'));
                onFloodLayerReorder([...reordered, ...susLayers]);
              }}
            />
            {/* Per-district structure count/area against the Flood
                Projections 2026 extent — only when projections are on. */}
            {floodProjectionEnabled && (
              <button
                className="risk-calc-btn risk-calc-btn--flood"
                onClick={() => { if (selectedDistrict) onOpenFloodProjection?.(); }}
                disabled={!selectedDistrict}
                title={selectedDistrict
                  ? 'Count and area of structures inside the flood projection for this district'
                  : 'Select a district first'}
                style={!selectedDistrict ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  <path d="M3 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.6"/>
                  <path d="M12 3c2.5 3 4 5.3 4 7.5A4 4 0 018 10.5C8 8.3 9.5 6 12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                </svg>
                {selectedDistrict
                  ? `Generate Count & Area · ${selectedDistrict}`
                  : 'Generate Count & Area of Structures'}
              </button>
            )}
          </>
        )}

        <button
          className="sidebar-accordion-header sidebar-accordion-header--encroach"
          onClick={() => setEncroachOpen((v) => !v)}
        >
          <svg
            className={`accordion-chevron${encroachOpen ? ' accordion-chevron--open' : ''}`}
            width="12" height="12" viewBox="0 0 12 12" fill="none"
          >
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Encroachment</span>
        </button>
        {encroachOpen && (
          <>
            <button
              className="risk-calc-btn risk-calc-btn--encroach"
              onClick={onOpenEncroachment}
              disabled={!encroachmentEnabled}
              title={encroachmentEnabled ? 'Run encroachment analysis for the selected district' : 'Select a district first'}
              style={!encroachmentEnabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                <path d="M3 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.7"/>
                <path d="M3 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.45"/>
              </svg>
              {selectedDistrict ? `Run on ${selectedDistrict}` : 'Run Analysis'}
            </button>
            {encroachmentLayers && (
              <EncroachmentLayersPanel
                layers={encroachmentLayers}
                onUpdate={onEncroachmentLayerUpdate}
                onReorder={onEncroachmentLayerReorder}
              />
            )}
          </>
        )}

        <button
          className="sidebar-accordion-header sidebar-accordion-header--sus"
          onClick={() => setSusOpen((v) => !v)}
        >
          <svg
            className={`accordion-chevron${susOpen ? ' accordion-chevron--open' : ''}`}
            width="12" height="12" viewBox="0 0 12 12" fill="none"
          >
            <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>Susceptibility Layers</span>
        </button>
        {susOpen && (
          <div className="sus-panel">
            {floodLayers.filter((l) => l.year.startsWith('sus-')).map((layer) => (
              <div key={layer.year} className={`sus-item${layer.visible ? ' sus-item--active' : ''}`}>
                <input
                  type="checkbox"
                  checked={layer.visible}
                  onChange={() => onFloodLayerUpdate(layer.year, { visible: !layer.visible })}
                />
                <span className="sus-item-swatch" style={{ background: layer.fillColor }} />
                <span className="sus-item-label">{layer.label}</span>
              </div>
            ))}
            <button className="sus-customize-btn" onClick={() => setSusStyleOpen(true)}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              Customize Styles
            </button>
          </div>
        )}

        {/* Risk Calculator — below Susceptibility */}
        <button
          className="risk-calc-btn risk-calc-btn--risk"
          onClick={() => setRiskCalcOpen(true)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
            <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
            <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
          </svg>
          Risk Calculator
        </button>

        {/* Divider */}
        <div className="sidebar-divider">
          <span className="sidebar-divider-label">Exposure Tools</span>
        </div>

        {/* GCOP / DEW Exposure Button */}
        <button
          className={`risk-calc-btn risk-calc-btn--simex${gcopExposureActive ? ' risk-calc-btn--active' : ''}`}
          onClick={onOpenGCOPExposure}
          title="Load a GCOP / DEW exposure footprint"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2"
                  stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6"/>
          </svg>
          {gcopExposureActive ? 'GCOP Active' : 'SIMEX'}
        </button>

        {/* Streams Exposure Button */}
        <button
          className={`risk-calc-btn risk-calc-btn--exposure${exposureActive ? ' risk-calc-btn--active' : ''}`}
          onClick={onOpenExposure}
          title="Load stream exposure for a date"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M3 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            <path d="M3 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/>
            <path d="M3 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity="0.45"/>
          </svg>
          {exposureActive ? 'Exposure Loaded' : 'Exposure'}
        </button>

      </div>

      {riskCalcOpen && (
        <RiskCalculatorModal
          district={selectedDistrict}
          districtData={districtData}
          province={selectedProvince}
          onClose={() => setRiskCalcOpen(false)}
        />
      )}

      {susStyleOpen && (
        <SusceptibilityStyleModal
          susLayers={floodLayers.filter((l) => l.year.startsWith('sus-'))}
          onUpdate={onFloodLayerUpdate}
          onReorder={(reorderedSus) => {
            const nonSus = floodLayers.filter((l) => !l.year.startsWith('sus-'));
            onFloodLayerReorder([...nonSus, ...reorderedSus]);
          }}
          onClose={() => setSusStyleOpen(false)}
        />
      )}
    </aside>
  );
}

export default Sidebar;
