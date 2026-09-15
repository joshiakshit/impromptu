const accessibleTopics = [
    "A habit that changed my life", "The best way to spend a free day", "What makes a good friend", "A place everyone should visit once", "The value of learning to cook", "How music affects our mood", "Why hobbies matter", "The role of humour in daily life", "What home means to me", "A useful lesson from failure",
    "The perfect morning routine", "Why reading still matters", "A skill I want to master", "Small acts of kindness", "The importance of sleep", "How travel changes perspective", "Living with less", "The benefits of walking", "What makes a memorable teacher", "A tradition worth keeping",
    "Is comfort the enemy of growth?", "What does success mean?", "Freedom and responsibility", "The power of silence", "Can time be wasted?", "Is curiosity more important than knowledge?", "The difference between confidence and arrogance", "When is change necessary?", "Does competition make us better?", "The meaning of courage",
    "Can money buy happiness?", "Why uncertainty is useful", "Is perfection worth pursuing?", "The value of patience", "Are first impressions reliable?", "What makes an idea powerful?", "Is being busy the same as being productive?", "The cost of convenience", "Do limits increase creativity?", "What should progress look like?",
    "Social media does more harm than good", "Should school uniforms be required?", "Remote work is better than office work", "Exams are not the best measure of ability", "Public transport should be free", "Four-day workweeks should become standard", "College education is worth the cost", "Advertising aimed at children should be banned", "Zoos should no longer exist", "Voting should be compulsory",
    "Technology makes us less patient", "Homework should be optional", "Cashless societies are a good idea", "Competitive sports belong in schools", "Cities should limit private cars", "Influencers should be accountable for recommendations", "Online learning can replace classrooms", "Everyone should take a gap year", "Fast fashion should be regulated", "Space exploration deserves public funding",
    "Artificial intelligence and the future of work", "The digital divide", "Privacy in a connected world", "Climate responsibility: individuals or governments?", "The pressure to be constantly available", "Misinformation and public trust", "Mental health at work", "The future of public libraries", "Food waste in modern cities", "Equal access to education",
    "The rise of the creator economy", "Should anonymity exist online?", "Balancing development and the environment", "The changing meaning of community", "Ageing populations and social responsibility", "Should companies disclose salary ranges?", "The ethics of planned obsolescence", "Can cities be both smart and humane?", "The impact of short-form video", "Should internet access be a basic right?",
    "Leaders are made, not born", "Teamwork matters more than individual talent", "Rules are meant to be challenged", "Failure teaches more than success", "Actions speak louder than words", "Young people should enter politics", "Debate is better than agreement", "Tradition can slow progress", "Privacy matters more than convenience", "Economic growth should not be the main goal",
    "Should robots care for older people?", "Local products are better than global brands", "News should be free to access", "Public figures deserve private lives", "Parents should limit children's screen time", "Libraries are more important than ever", "Schools should teach personal finance", "Governments should regulate addictive app design", "Work experience matters more than qualifications", "Every citizen should do community service"
];
const advancedSubjects = [
    "the Fermi paradox", "the anthropic principle", "Boltzmann brains", "quantum decoherence", "vacuum decay", "the black hole information paradox", "the holographic principle", "cosmic inflation", "dark matter detection", "the heat death of the universe",
    "epigenetic inheritance", "horizontal gene transfer", "the microbiome-gut-brain axis", "convergent evolution", "the RNA world hypothesis", "CRISPR gene drives", "synthetic biology", "de-extinction", "biological immortality", "the evolutionary origin of cooperation",
    "the precautionary principle", "the replication crisis", "Bayesian epistemology", "the demarcation problem in science", "Goodhart's law", "the Lindy effect", "the observer effect in social research", "the philosophy of falsifiability", "scientific paradigm shifts", "the limits of statistical significance",
    "the tragedy of the anticommons", "Georgist land taxation", "modern monetary theory", "the resource curse", "the Dutch disease", "regulatory capture", "prediction markets", "universal basic services", "post-growth economics", "the economics of attention",
    "algorithmic monoculture", "federated learning", "homomorphic encryption", "zero-knowledge proofs", "brain-computer interfaces", "neuromorphic computing", "digital twins", "the alignment problem", "data colonialism", "the right to explanation for algorithms",
    "sortition in government", "liquid democracy", "subsidiarity", "constitutional originalism", "legal personhood for nature", "intergenerational justice", "the paradox of tolerance", "civil disobedience in democracies", "sovereign immunity", "the ethics of whistleblowing",
    "the Ship of Theseus", "moral luck", "the experience machine", "negative utilitarianism", "epistemic injustice", "the veil of ignorance", "the Chinese room argument", "the hard problem of consciousness", "the ethics of future people", "moral responsibility without free will",
    "the Bronze Age collapse", "the Antikythera mechanism", "the Great Divergence", "the Columbian Exchange", "the invention of double-entry bookkeeping", "the Hanseatic League", "the Library of Alexandria as a symbol", "the history of standardized time", "the enclosure movement", "the role of salt in state formation",
    "linguistic relativity", "language death", "the uncanny valley", "cargo cults", "rituals as social technology", "the invention of childhood", "collective memory", "cultural appropriation versus exchange", "the ethics of museums holding contested objects", "the effect of maps on political power"
];
const advancedLenses = [
    (subject) => `Explain ${subject} to an intelligent audience with no background in it.`,
    (subject) => `What does ${subject} reveal about the limits of human knowledge?`,
    (subject) => `Why should a non-specialist care about ${subject}?`,
    (subject) => `Which common assumption about ${subject} deserves the most scrutiny?`,
    (subject) => `Make the strongest case for taking ${subject} seriously.`,
    (subject) => `What could society misunderstand about ${subject}, and why would that matter?`,
    (subject) => `Should public policy respond to ${subject}? Defend a position.`,
    (subject) => `What ethical conflict is hidden inside ${subject}?`,
    (subject) => `Connect ${subject} to a decision ordinary people make.`,
    (subject) => `Argue against the most popular interpretation of ${subject}.`
];
const advancedTopics = advancedSubjects.flatMap(subject => advancedLenses.map(makeTopic => makeTopic(subject)));
export const topics = [...advancedTopics, ...accessibleTopics];
if (topics.length !== 1000 || new Set(topics).size !== 1000) {
    throw new Error("The topic bank must contain exactly 1,000 unique topics.");
}
