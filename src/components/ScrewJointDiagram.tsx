// Two plates in a lap joint with a screw through the overlap. The load is carried
// across ONE shear plane (the plate interface) → single shear.
export function ScrewJointDiagram() {
  return (
    <svg className="diagram" viewBox="0 0 400 230" role="img" aria-label="Screw connecting two plates in single shear">
      <defs>
        <marker id="ar" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
          <path d="M0,0 L8,3 L0,6 Z" fill="#c0392b" />
        </marker>
        <marker id="al" markerWidth="10" markerHeight="10" refX="2" refY="3" orient="auto">
          <path d="M8,0 L0,3 L8,6 Z" fill="#c0392b" />
        </marker>
        <marker id="dim" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,4 L8,0 L8,8 Z" fill="#64748b" />
        </marker>
      </defs>

      {/* upper plate (pulled left) */}
      <rect x="40" y="92" width="190" height="26" fill="#dbe4f0" stroke="#334155" strokeWidth="2" />
      <line x1="40" y1="105" x2="14" y2="105" stroke="#c0392b" strokeWidth="3" markerEnd="url(#al)" />
      <text x="18" y="96" fontSize="16" fill="#c0392b">F</text>

      {/* lower plate (pulled right) */}
      <rect x="170" y="118" width="190" height="26" fill="#c7d2e0" stroke="#334155" strokeWidth="2" />
      <line x1="360" y1="131" x2="386" y2="131" stroke="#c0392b" strokeWidth="3" markerEnd="url(#ar)" />
      <text x="372" y="160" fontSize="16" fill="#c0392b">F</text>

      {/* screw: head, shank through both plates, nut */}
      <rect x="186" y="74" width="28" height="14" rx="2" fill="#94a3b8" stroke="#1e293b" strokeWidth="2" />
      <rect x="192" y="88" width="16" height="60" fill="#94a3b8" stroke="#1e293b" strokeWidth="2" />
      <rect x="184" y="148" width="32" height="12" rx="2" fill="#94a3b8" stroke="#1e293b" strokeWidth="2" />

      {/* shear plane at the plate interface */}
      <line x1="170" y1="118" x2="230" y2="118" stroke="#c0392b" strokeWidth="2.5" strokeDasharray="5 3" />
      <text x="234" y="122" fontSize="12" fill="#c0392b">shear plane (single)</text>

      {/* diameter d */}
      <line x1="192" y1="172" x2="208" y2="172" stroke="#64748b" markerStart="url(#dim)" markerEnd="url(#dim)" />
      <text x="200" y="188" fontSize="13" fill="#64748b" textAnchor="middle">d</text>

      <text x="200" y="216" fontSize="13" fill="#334155" textAnchor="middle">τ = F / (n · π d² / 4)</text>
    </svg>
  );
}
