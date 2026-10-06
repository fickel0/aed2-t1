// nível de prioridade de cada tipo, de 5 (risco de vida agora) a 1 (pode esperar).
// precisa do tabelaHash.js carregado antes

// a hash tipo → nível
const prioridades = new TabelaHash();

function definirNivel(nivel, tipos) {
    for (const tipo of tipos) prioridades.inserir(tipo, nivel);
}

definirNivel(5, [
    "Cardiac arrest",
    "Shooting",
    "Drowning",
    "Building fire",
    "Unresponsive subject",
    "Unconscious subject",
    "Choking",
    "Electrocution",
]);

definirNivel(4, [
    "CVA/stroke",
    "Overdose",
    "Vehicle accident",
    "Gas-odor/leak",
    "Respiratory emergency",
    "Cardiac emergency",
    "Hemorrhaging",
    "Allergic reaction",
    "Diabetic emergency",
    "Altered mental status",
    "Carbon monoxide detector",
    "Hazardous materials incident",
    "Rescue",
    "Assault victim",
    "Burn victim",
    "Head injury",
    "Poisoning",
    "Maternity",
    "Electrical fire outside",
    "Heat exhaustion",
]);

definirNivel(3, [
    "Fall victim",
    "Seizures",
    "Vehicle fire",
    "Syncopal episode",
    "Unknown medical emergency",
    "Unknown type fire",
    "Appliance fire",
    "Fracture",
    "Lacerations",
    "Abdominal pains",
    "Woods/field fire",
    "Trash/dumpster fire",
    "Hazardous road conditions",
    "Vehicle leaking fuel",
    "Elevator emergency",
    "Medical alert alarm",
]);

definirNivel(2, [
    "Fire alarm",
    "Road obstruction",
    "Subject in pain",
    "Debris/fluids on highway",
    "Fever",
    "Fire investigation",
    "Dizziness",
    "Nausea/vomiting",
    "General weakness",
    "Back pains/injury",
    "Eye injury",
    "Animal bite",
    "Dehydration",
]);

definirNivel(1, [
    "Disabled vehicle",
    "Transferred call",
    "Standby for another CO",
    "S/B at helicopter landing",
    "EMS special service",
    "Fire special service",
    "Fire police needed",
]);

// tipo que não está na tabela (num CSV editado à mão, por exemplo) fica no meio: 3
function nivelDe(o) {
    const nivel = prioridades.buscar(o.tipo);
    if (nivel === undefined) return 3;
    return nivel;
}
