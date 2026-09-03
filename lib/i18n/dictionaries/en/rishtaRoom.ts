/**
 * The Rishta Room: participants, meetings, requests, tasks, in-room
 * verification and services, and the helper panel, plus the family's rooms
 * card. components/rishta/*, components/family/FamilyRoomsCard.tsx,
 * app/family/rishta/[participantId], app/partner/rooms/*,
 * app/user/rishta/[otherUserId], and the API routes under app/api/partner/rooms,
 * app/api/family-portal/rooms and app/api/rishta.
 */
const rishtaRoom: Record<string, string> = {
  // Shared write-path errors (app/api/rishta, useRishtaPost, HelperRoomPanel)
  "rishtaRoom.api.badJson": "Couldn't read the request JSON.",
  "rishtaRoom.api.invalidRequest": "Invalid request.",
  "rishtaRoom.api.meetingNotFound": "This meeting wasn't found.",
  "rishtaRoom.api.noRishta": "There's no rishta with this person yet.",
  "rishtaRoom.api.personNotFound": "This person wasn't found.",
  "rishtaRoom.api.roomNotYours": "This rishta isn't yours to see.",
  "rishtaRoom.post.failedTitle": "Couldn't do that",
  "rishtaRoom.post.networkError": "Network error — please try again",
  "rishtaRoom.post.tryAgain": "Please try again.",

  // components/family/FamilyRoomsCard
  "rishtaRoom.familyCard.openTasksSuffix": "tasks assigned to you",
  "rishtaRoom.familyCard.title": "Rishtas you've been added to",

  // app/family/rishta/[participantId]/page
  "rishtaRoom.familyPage.backLink": "Back",
  "rishtaRoom.familyPage.ownerNameFallback": "Their",

  // components/rishta/HelperRoomPanel
  "rishtaRoom.helperPanel.awaitingAnswer": "Waiting for an answer",
  "rishtaRoom.helperPanel.callPlaceholder": "Call",
  "rishtaRoom.helperPanel.cancelAction": "Cancel",
  "rishtaRoom.helperPanel.cannotAsk":
    "You can't request anything here — they've only given permission to view and do tasks.",
  "rishtaRoom.helperPanel.dateNotSet": "date not set",
  "rishtaRoom.helperPanel.dueSuffix": "by",
  "rishtaRoom.helperPanel.markDoneAriaSuffix": "is done",
  "rishtaRoom.helperPanel.myRequestsEmpty": "You haven't asked for anything yet.",
  "rishtaRoom.helperPanel.myRequestsHeading": "What you've said",
  "rishtaRoom.helperPanel.myTasksEmpty": "You don't have any tasks right now.",
  "rishtaRoom.helperPanel.myTasksHeading": "Assigned to you",
  "rishtaRoom.helperPanel.otherTasksSuffix": "tasks in this rishta are assigned to someone else.",
  "rishtaRoom.helperPanel.reasonPlaceholder": "Write a reason — they'll see this",
  "rishtaRoom.helperPanel.reopenAriaSuffix": "reopen it",
  "rishtaRoom.helperPanel.sendAction": "Send",
  "rishtaRoom.helperPanel.stageHeading": "How far this has come",
  "rishtaRoom.helperPanel.statusApproved": "they said yes",
  "rishtaRoom.helperPanel.statusDeclined": "they declined",
  "rishtaRoom.helperPanel.statusWithdrawn": "withdrawn",
  "rishtaRoom.helperPanel.whenSuggestionAria": "When (suggestion)",
  "rishtaRoom.helperPanel.whereSuggestionPlaceholder": "Where? (suggestion)",
  "rishtaRoom.helperPanel.withdrawAction": "Withdraw",

  // components/rishta/RoomMeetings
  "rishtaRoom.meetings.cancelAction": "Cancel",
  "rishtaRoom.meetings.checkpointNotePlaceholder": "Add a note if you'd like (optional) — only you will see this",
  "rishtaRoom.meetings.checkpointRecordedNote":
    "Your answer has been recorded. If you want to report them, you can do it from their profile.",
  "rishtaRoom.meetings.dateNotSet": "date not set",
  "rishtaRoom.meetings.empty": "No meeting has been recorded yet.",
  "rishtaRoom.meetings.howWasItAction": "How did the meeting go?",
  "rishtaRoom.meetings.metPrefix": "Met —",
  "rishtaRoom.meetings.placePlaceholder": "Where? e.g. at home, a cafe",
  "rishtaRoom.meetings.planAction": "Plan a meeting",
  "rishtaRoom.meetings.saveAction": "Save",
  "rishtaRoom.meetings.weMetAction": "We met",
  "rishtaRoom.meetings.youSaidPrefix": "You said:",

  // components/rishta/RoomParticipants
  "rishtaRoom.participants.addSomeoneAction": "Add someone to this rishta",
  "rishtaRoom.participants.admitAction": "Add",
  "rishtaRoom.participants.emptyPrefix":
    "Right now it's just you in this rishta. To add family or a partner for help, first give them",
  "rishtaRoom.participants.emptySuffix": "permission from Profile Access — they'll show up here after that.",
  "rishtaRoom.participants.kindFamily": "family",
  "rishtaRoom.participants.kindPartner": "partner",
  "rishtaRoom.participants.noPermissions": "Can only view and take tasks — can't request anything.",
  "rishtaRoom.participants.openTasksSuffix": "tasks pending",
  "rishtaRoom.participants.pendingRequestsSuffix": "waiting on your answer",
  "rishtaRoom.participants.permissionEnded": "permission ended",
  "rishtaRoom.participants.removeAriaSuffix": "remove from this rishta",

  // app/partner/rooms/page and app/partner/rooms/[participantId]/page
  "rishtaRoom.partnerRoomsPage.emptyDescription":
    "Clients can add you from their own Rishta Room. Once they do, that rishta will show up here.",
  "rishtaRoom.partnerRoomsPage.emptyTitle": "You haven't been added to any rishta yet.",
  "rishtaRoom.partnerRoomsPage.intro":
    "The rishtas a client has added you to themselves. In each one you see only as much as they've allowed — never the chat, their private notes, or their answer after a meeting.",
  "rishtaRoom.partnerRoomsPage.pendingRequestsSuffix": "waiting on their answer",
  "rishtaRoom.partnerRoomsPage.title": "Rishtas",
  "rishtaRoom.partnerRoomsPage.withSuffix": "with",

  // components/rishta/RoomRequests
  "rishtaRoom.requests.callPlaceholder": "Call",
  "rishtaRoom.requests.cancelAction": "Cancel",
  "rishtaRoom.requests.confirmApproveAction": "Yes, confirm it",
  "rishtaRoom.requests.empty":
    "Nobody has asked for anything yet. The people you've added to this rishta can request a family introduction, a call, or a meeting from here — what happens is whatever you decide.",
  "rishtaRoom.requests.kindFamily": "family",
  "rishtaRoom.requests.kindPartner": "partner",
  "rishtaRoom.requests.notNowAction": "Not now",
  "rishtaRoom.requests.notePlaceholder": "Anything to tell them? (optional)",
  "rishtaRoom.requests.theirSuggestionSuffix": "— their suggestion",
  "rishtaRoom.requests.whenAria": "When",
  "rishtaRoom.requests.wherePlaceholder": "Where?",
  "rishtaRoom.requests.yesAction": "Yes",

  // components/rishta/RoomServices
  "rishtaRoom.services.viewAllLink": "View the full booking",

  // components/rishta/RoomTasks
  "rishtaRoom.tasks.addAction": "Add a task",
  "rishtaRoom.tasks.assigneeSelf": "You'll do it",
  "rishtaRoom.tasks.cancelAction": "Cancel",
  "rishtaRoom.tasks.deleteAriaSuffix": "delete it",
  "rishtaRoom.tasks.dueDateAria": "Due by",
  "rishtaRoom.tasks.dueSuffix": "by",
  "rishtaRoom.tasks.empty":
    "No tasks recorded yet. Write down whatever needs doing — by you, family, or a partner — so there's no argument later about who was supposed to do what.",
  "rishtaRoom.tasks.markDoneAriaSuffix": "is done",
  "rishtaRoom.tasks.reopenAriaSuffix": "reopen it",
  "rishtaRoom.tasks.saveAction": "Save",
  "rishtaRoom.tasks.titlePlaceholder": "What's the task?",
  "rishtaRoom.tasks.wasDueSuffix": "was due by",

  // app/user/rishta/[otherUserId]/page
  "rishtaRoom.userPage.askGrioLink": "Ask Grio",
  "rishtaRoom.userPage.askGrioQuerySuffix": "— what should I do next in this rishta?",
  "rishtaRoom.userPage.backLink": "My Rishtas",
  "rishtaRoom.userPage.chatLink": "Chat",
  "rishtaRoom.userPage.ctaChat": "Open chat",
  "rishtaRoom.userPage.ctaFamily": "Open Family",
  "rishtaRoom.userPage.ctaInterests": "Open Interests",
  "rishtaRoom.userPage.ctaMeeting": "Plan a meeting",
  "rishtaRoom.userPage.ctaStage": "Update stage",
  "rishtaRoom.userPage.ctaTopics": "See topics",
  "rishtaRoom.userPage.familyCircleLink": "Family Circle",
  "rishtaRoom.userPage.familyHeading": "From your family",
  "rishtaRoom.userPage.fullProfileLink": "Full profile",
  "rishtaRoom.userPage.helpHeading": "Need help?",
  "rishtaRoom.userPage.lastTalkedPrefix": "last talked",
  "rishtaRoom.userPage.meetingsHeading": "Meetings",
  "rishtaRoom.userPage.messageSuffix": "messages",
  "rishtaRoom.userPage.nextStepWhoBoth": "Next step is on both of you",
  "rishtaRoom.userPage.nextStepWhoDone": "This rishta has run its course",
  "rishtaRoom.userPage.nextStepWhoThem": "Next step is on them",
  "rishtaRoom.userPage.nextStepWhoYou": "Next step is on you",
  "rishtaRoom.userPage.noFamilyNotesPrefix": "Your family hasn't written anything about this rishta yet.",
  "rishtaRoom.userPage.noFamilyNotesSuffix":
    "add them there — they can look at the profile and leave their opinion right here.",
  "rishtaRoom.userPage.notesHeading": "My own notes",
  "rishtaRoom.userPage.participantsHeading": "Who else is in this rishta",
  "rishtaRoom.userPage.privacyFooter":
    "Everything on this page — stage, topics, meetings, notes — is yours alone. The other person can't see it, and you can't see their own record either. The people you've added to this rishta see only the stage, tasks, and confirmed meetings.",
  "rishtaRoom.userPage.requestsHeading": "What's been asked of you",
  "rishtaRoom.userPage.servicesHeading": "Services booked for this rishta",
  "rishtaRoom.userPage.shortlistedBySuffix": "shortlisted them for you.",
  "rishtaRoom.userPage.stageHeading": "How far things have come",
  "rishtaRoom.userPage.tasksHeading": "Tasks — who has to do what",
  "rishtaRoom.userPage.topicsHeading": "Things that aren't clear yet",
  "rishtaRoom.userPage.verificationHeading": "What's been checked",
  "rishtaRoom.userPage.verifiedBadge": "Verified",

  // components/rishta/RoomVerification
  "rishtaRoom.verification.askAction": "Ask",
  "rishtaRoom.verification.askableHeading": "You can ask them to prove one of these",
  "rishtaRoom.verification.cancelAction": "Cancel",
  "rishtaRoom.verification.messagePlaceholder": "Why are you asking? They'll see this.",
  "rishtaRoom.verification.noCheckSuffix": "hasn't had any check done yet.",
  "rishtaRoom.verification.payerRequester": "you'll pay the whole thing",
  "rishtaRoom.verification.payerSplitPrefix": "half you",
  "rishtaRoom.verification.payerSplitSuffix": "half them",
  "rishtaRoom.verification.payerSubject": "they'll pay the whole thing, and they can also decline",
  "rishtaRoom.verification.statusOther": "closed",
  "rishtaRoom.verification.totalCostPrefix": "Total cost",
  "rishtaRoom.verification.youAskedPrefix": "You asked:",
};

export default rishtaRoom;
