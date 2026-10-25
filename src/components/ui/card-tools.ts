/**
 * Holds a card's header buttons (eye, settings, a link). Pulls them out by the buttons' 10px
 * padding, so the last icon lines up with the card's content edge instead of sitting inside it.
 * Kept out of client modules so server components get the class name itself.
 */
export const cardTools = "-mr-2.5 flex shrink-0 items-center";
