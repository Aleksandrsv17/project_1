import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Keyboard, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, LayoutAnimation, UIManager } from 'react-native';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { searchPlaces, getPlaceDetails, reverseGeocode, PlacePrediction, LatLng } from '../../api/maps';
import {
  startChauffeurTrip,
  addChauffeurStop,
  departChauffeurStop,
  finishChauffeurTrip,
  cancelChauffeurTrip,
  rateChauffeurTrip,
} from '../../api/chauffeurTrips';
import { useChauffeurStore, ChauffeurStop } from '../../store/chauffeurStore';
import { CAR_LABELS } from '../../utils/chauffeurPricing';
import { useLocation } from '../../hooks/useLocation';
import { COLORS, BORDER_RADIUS, DEFAULT_REGION } from '../../utils/constants';
import { darkMapStyle } from '../../themes/mapStyles';

const currSymbol = '$';

type AddStopMode = 'closed' | 'search' | 'pin';

export function ChauffeurActiveScreen({ navigation }: any) {
  const st = getStyles();
  const trip = useChauffeurStore(s => s.trip);
  const tick = useChauffeurStore(s => s.tick);
  const reset = useChauffeurStore(s => s.reset);
  const { location, address: userAddress } = useLocation();
  const mapRef = useRef<MapView>(null);

  const [addMode, setAddMode] = useState<AddStopMode>('closed');
  const [searchText, setSearchText] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [mapCenter, setMapCenter] = useState<LatLng | null>(null);
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(0);
  const [tipPreset, setTipPreset] = useState<'none' | 'p10' | 'p15' | 'p20' | 'custom'>('none');
  const [customTipText, setCustomTipText] = useState('');
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const carouselRef = useRef<ScrollView>(null);

  const toggleHeader = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHeaderExpanded(e => !e);
  };

  const scrollCarouselToCurrent = useCallback(() => {
    if (!carouselRef.current || !trip || trip.currentStopIndex < 0) return;
    carouselRef.current.scrollTo({ y: trip.currentStopIndex * STOP_CARD_HEIGHT, animated: true });
  }, [trip?.currentStopIndex]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1-Hz tick to update waiting time display and running fare.
  useEffect(() => {
    const interval = setInterval(() => tick(), 1000);
    return () => clearInterval(interval);
  }, [tick]);

  // If someone lands here without a trip, bounce back.
  useEffect(() => {
    if (!trip) navigation.goBack();
  }, [trip, navigation]);

  const currentStop = trip && trip.currentStopIndex >= 0 ? trip.stops[trip.currentStopIndex] : null;
  const waitingStop = currentStop?.status === 'arrived' ? currentStop : null;
  const awaitingNextDestination =
    trip?.status === 'in_progress' &&
    (!currentStop || currentStop.status === 'completed');

  // ── Map focus: initial zoom on meaningful state transitions ──────────────
  useEffect(() => {
    if (!trip || !mapRef.current) return;
    if (trip.status === 'driver_arrived') {
      mapRef.current.animateToRegion({
        latitude: trip.pickup.latitude,
        longitude: trip.pickup.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
    } else if (trip.status === 'in_progress' && currentStop && trip.driver?.location) {
      mapRef.current.fitToCoordinates(
        [trip.driver.location, { latitude: currentStop.latitude, longitude: currentStop.longitude }],
        { edgePadding: { top: 180, right: 60, bottom: 320, left: 60 }, animated: true },
      );
    } else if (trip.status === 'in_progress' && currentStop) {
      mapRef.current.animateToRegion({
        latitude: currentStop.latitude,
        longitude: currentStop.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
    }
    // Other statuses (requested / driver_assigned / driver_arriving / finished / cancelled):
    // leave initialRegion as-is.
  }, [trip?.status, trip?.currentStopIndex]);

  // ── Follow the driver while they're moving to somewhere ──────────────────
  // Pan the camera to keep the driver centered while heading to pickup or a
  // stop. Does NOT change zoom (so the user can pinch to adjust and stay at
  // that zoom while we just pan). Skipped while waiting at a stop or finished.
  useEffect(() => {
    if (!trip || !mapRef.current || !trip.driver?.location) return;
    const following =
      trip.status === 'driver_arriving' ||
      (trip.status === 'in_progress' && currentStop?.status === 'en_route');
    if (!following) return;
    mapRef.current.animateCamera(
      { center: trip.driver.location },
      { duration: 500 },
    );
  }, [trip?.driver?.location?.latitude, trip?.driver?.location?.longitude, trip?.status, currentStop?.status]);

  const handleSearchText = useCallback((text: string) => {
    if (!trip) return;
    setSearchText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) { setPredictions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const loc = currentStop ?? trip.pickup;
        setPredictions(await searchPlaces(text, { latitude: loc.latitude, longitude: loc.longitude }));
      } catch { setPredictions([]); }
    }, 300);
  }, [trip, currentStop]);

  if (!trip) return null;

  const submitNewStop = async (input: { address: string; latitude: number; longitude: number }) => {
    setBusy(true);
    try {
      if (currentStop && currentStop.status === 'arrived' && !currentStop.departedAt) {
        await departChauffeurStop(trip.id, trip.currentStopIndex);
      }
      await addChauffeurStop(trip.id, input);
      setAddMode('closed');
      setSearchText('');
      setPredictions([]);
    } catch (err) {
      Alert.alert('Could not add stop', err instanceof Error ? err.message : 'Try again');
    } finally {
      setBusy(false);
    }
  };

  const handleSelectPrediction = async (p: PlacePrediction) => {
    setPredictions([]);
    Keyboard.dismiss();
    try {
      const d = await getPlaceDetails(p.placeId);
      await submitNewStop({ address: p.mainText, latitude: d.latitude, longitude: d.longitude });
    } catch (err) {
      Alert.alert('Could not add stop', err instanceof Error ? err.message : 'Try again');
    }
  };

  const handleConfirmPin = async () => {
    if (!mapCenter) return;
    try {
      const geo = await reverseGeocode(mapCenter.latitude, mapCenter.longitude);
      const addr = geo.formattedAddress || `${mapCenter.latitude.toFixed(4)}, ${mapCenter.longitude.toFixed(4)}`;
      await submitNewStop({ address: addr, latitude: mapCenter.latitude, longitude: mapCenter.longitude });
    } catch {
      await submitNewStop({
        address: `${mapCenter.latitude.toFixed(4)}, ${mapCenter.longitude.toFixed(4)}`,
        latitude: mapCenter.latitude,
        longitude: mapCenter.longitude,
      });
    }
  };

  const handleStartTrip = async () => {
    setBusy(true);
    try { await startChauffeurTrip(trip.id); setAddMode('search'); }
    catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Could not start trip'); }
    finally { setBusy(false); }
  };

  const handleFinish = async () => {
    setBusy(true);
    try { await finishChauffeurTrip(trip.id); }
    catch (err) { Alert.alert('Error', err instanceof Error ? err.message : 'Could not finish trip'); }
    finally { setBusy(false); }
  };

  const handleCancel = () => {
    Alert.alert('Cancel trip', 'This will end the chauffeur trip.', [
      { text: 'Keep trip', style: 'cancel' },
      { text: 'Cancel trip', style: 'destructive', onPress: async () => {
        setBusy(true);
        try { await cancelChauffeurTrip(trip.id); }
        finally { setBusy(false); }
      }},
    ]);
  };

  const computeTipAmount = (fareTotal: number): number => {
    if (tipPreset === 'none') return 0;
    if (tipPreset === 'p10') return fareTotal * 0.10;
    if (tipPreset === 'p15') return fareTotal * 0.15;
    if (tipPreset === 'p20') return fareTotal * 0.20;
    const parsed = parseFloat(customTipText.replace(',', '.'));
    return isNaN(parsed) || parsed < 0 ? 0 : parsed;
  };

  const handleDone = async () => {
    if (!trip) { navigation.goBack(); return; }
    const tipAmount = computeTipAmount(trip.fare.total);
    setBusy(true);
    try {
      if (trip.status === 'finished' && (rating > 0 || tipAmount > 0)) {
        await rateChauffeurTrip(trip.id, { rating, tipAmount });
      }
    } catch (err) {
      // Non-critical: rating submission failure shouldn't block the user from leaving.
      console.warn('[chauffeur] rating submit failed', err);
    } finally {
      setBusy(false);
      reset();
      navigation.goBack();
    }
  };

  const handleUseCurrentLocation = async () => {
    if (!location) return;
    const addr = userAddress ?? 'Current location';
    await submitNewStop({ address: addr, latitude: location.latitude, longitude: location.longitude });
  };

  const handleClosePanel = () => {
    Keyboard.dismiss();
    setAddMode('closed');
    setSearchText('');
    setPredictions([]);
  };

  // ── Derived fare / timer strings ─────────────────────────────────────────
  const waitingMs = waitingStop ? trip.now - (waitingStop.arrivedAt ?? trip.now) : 0;
  const waitingMinStr = formatDuration(waitingMs);
  const fareStr = `${currSymbol}${trip.fare.total.toFixed(2)}`;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <View style={st.container}>
      <MapView
        ref={mapRef}
        style={st.map}
        provider={PROVIDER_GOOGLE}
        customMapStyle={darkMapStyle}
        initialRegion={{ latitude: trip.pickup.latitude, longitude: trip.pickup.longitude, latitudeDelta: 0.04, longitudeDelta: 0.04 }}
        showsUserLocation
        onRegionChangeComplete={r => setMapCenter({ latitude: r.latitude, longitude: r.longitude })}
        onPanDrag={scrollCarouselToCurrent}
        onPress={scrollCarouselToCurrent}
      >
        {addMode !== 'pin' && (
          <Marker coordinate={trip.pickup} anchor={{ x: 0.5, y: 1 }}>
            <View style={st.mapAddrCard}><Text style={st.mapAddrText} numberOfLines={1}>Pickup</Text></View>
            <View style={st.pin}>
              <View style={[st.pinHead, { backgroundColor: COLORS.grayLight, borderWidth: 3, borderColor: COLORS.textPrimary }]}>
                <Text style={{ fontSize: 12, color: COLORS.textPrimary }}>✦</Text>
              </View>
              <View style={st.pinNeedle} />
            </View>
          </Marker>
        )}

        {addMode !== 'pin' && trip.stops.map((s, i) => (
          <Marker key={s.id} coordinate={{ latitude: s.latitude, longitude: s.longitude }} anchor={{ x: 0.5, y: 1 }}>
            <View style={st.mapAddrCard}><Text style={st.mapAddrText} numberOfLines={1}>{`Stop ${i + 1}`}</Text></View>
            <View style={st.pin}>
              <View style={[st.pinHead, { backgroundColor: s.status === 'completed' ? COLORS.gray : COLORS.primary }]}>
                <Text style={{ fontSize: 12, color: COLORS.background }}>{i + 1}</Text>
              </View>
              <View style={st.pinNeedle} />
            </View>
          </Marker>
        ))}

        {addMode !== 'pin' && trip.driver?.location && (
          <Marker coordinate={trip.driver.location} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={st.liveDriverMarker}><Text style={st.liveDriverIcon}>◆</Text></View>
          </Marker>
        )}

        {addMode !== 'pin' && trip.driver?.location && trip.status === 'driver_arriving' && (
          <Polyline
            coordinates={[trip.driver.location, trip.pickup]}
            strokeColor="#141414"
            strokeWidth={3}
            lineDashPattern={[6, 4]}
          />
        )}
      </MapView>

      {/* Add-stop PIN overlay */}
      {addMode === 'pin' && (<>
        <View style={st.dropOverlay} pointerEvents="none">
          <View style={{ alignItems: 'center', marginBottom: 46 }}>
            <View style={[st.pinHead, { backgroundColor: '#d9c0a4' }]}>
              <Text style={{ fontSize: 14, color: '#000000', fontWeight: '700' }}>+</Text>
            </View>
            <View style={st.pinNeedle} />
          </View>
        </View>
        <SafeAreaView style={st.dropUI} edges={['top', 'bottom']} pointerEvents="box-none">
          <View style={st.dropTopBar}>
            <TouchableOpacity style={st.backBtn} onPress={() => setAddMode('search')}>
              <Text style={st.backText}>←</Text>
            </TouchableOpacity>
          </View>
          <View style={st.dropBottomBar}>
            <TouchableOpacity style={[st.confirmBtn, busy && { opacity: 0.7 }]} onPress={handleConfirmPin} disabled={busy} activeOpacity={0.85}>
              {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={st.confirmBtnText}>Confirm Stop</Text>}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </>)}

      {/* Header: driver card + status + expand for actions.
          Only appears once the trip has started (in_progress) — keeps the map
          clean while searching, while the driver is approaching, and at pickup. */}
      {addMode !== 'pin' && trip.status === 'in_progress' && (
        <SafeAreaView style={st.headerOverlay} edges={['top']} pointerEvents="box-none">
          <TouchableOpacity activeOpacity={0.95} onPress={toggleHeader} style={st.headerCard}>
            {/* Top row: avatar + driver info + fare */}
            <View style={st.headerTopRow}>
              {trip.driver ? (
                <View style={st.headerAvatar}>
                  <Text style={st.headerAvatarText}>{trip.driver.name.charAt(0)}</Text>
                </View>
              ) : (
                <View style={[st.headerAvatar, st.headerAvatarPending]}>
                  <ActivityIndicator color="#141414" size="small" />
                </View>
              )}
              <View style={st.headerDriverCol}>
                <Text style={st.headerDriverName} numberOfLines={1}>
                  {trip.driver?.name ?? 'Finding your chauffeur…'}
                </Text>
                <View style={st.headerMetaRow}>
                  <Text style={st.headerVehicleText} numberOfLines={1}>
                    {trip.driver ? `${trip.driver.vehicleMake} ${trip.driver.vehicleModel}` : CAR_LABELS[trip.carType]}
                  </Text>
                  {trip.driver?.vehiclePlate ? (<>
                    <View style={st.headerMetaDot} />
                    <Text style={st.headerPlate}>{trip.driver.vehiclePlate}</Text>
                  </>) : null}
                </View>
              </View>
              <View style={st.headerFareCol}>
                <Text style={st.fareLabel}>FARE</Text>
                <Text style={st.fareValue}>{fareStr}</Text>
              </View>
            </View>

            {/* Centered status / waiting row */}
            <View style={st.headerStatusBar}>
              {waitingStop ? (
                <View style={st.headerWaitingRow}>
                  <View style={st.headerWaitingDot} />
                  <Text style={st.headerWaitingLabel}>WAITING</Text>
                  <Text style={st.headerWaitingTime}>{waitingMinStr}</Text>
                </View>
              ) : (
                <Text style={st.headerStatusCentered}>
                  {statusLabel(trip.status, false)}
                </Text>
              )}
            </View>

            {/* Expanded drawer — quick actions */}
            {headerExpanded && (
              <View style={st.headerDrawer}>
                <View style={st.headerActionsRow}>
                  <TouchableOpacity
                    style={[st.headerActionBtn, !trip.driver && st.headerActionBtnDisabled]}
                    disabled={!trip.driver}
                    onPress={() => Alert.alert('Call driver', `Calling ${trip.driver?.name ?? 'driver'}…`)}
                  >
                    <CallIcon />
                    <Text style={st.headerActionLabel}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[st.headerActionBtn, !trip.driver && st.headerActionBtnDisabled]}
                    disabled={!trip.driver}
                    onPress={() => Alert.alert('Message driver', `Messaging ${trip.driver?.name ?? 'driver'}…`)}
                  >
                    <MessageIcon />
                    <Text style={st.headerActionLabel}>Message</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={st.headerActionBtn}
                    onPress={() => Alert.alert('Support', 'Contacting support…')}
                  >
                    <HelpIcon />
                    <Text style={st.headerActionLabel}>Help</Text>
                  </TouchableOpacity>
                </View>
                {trip.stops.length > 0 && (
                  <Text style={st.headerDrawerMeta}>
                    {trip.stops.filter(s => s.status === 'completed').length} of {trip.stops.length} stop{trip.stops.length !== 1 ? 's' : ''} completed
                  </Text>
                )}
              </View>
            )}

            {/* Chevron pill — clearer affordance that the card expands */}
            <View style={st.headerChevronWrap}>
              <View style={st.headerChevronPill}>
                <Text style={st.headerChevron}>{headerExpanded ? '▴' : '▾'}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {/* ── Bottom panel varies by status ───────────────────────────────── */}

      {/* Search panel — destination picker */}
      {addMode === 'search' && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={st.searchKav}
          pointerEvents="box-none"
        >
          <View style={st.searchPanel}>
            <View style={st.searchHandle} />

            <View style={st.searchHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={st.searchTitle}>
                  {trip.stops.filter(s => s.status !== 'completed').length === 0
                    ? 'Where to first?'
                    : 'Next destination'}
                </Text>
                <Text style={st.searchSubtitle}>
                  Stop {trip.stops.length + 1} · tell your chauffeur where to go
                </Text>
              </View>
              <TouchableOpacity style={st.closeBtn} onPress={handleClosePanel} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={st.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={st.searchField}>
              <View style={st.searchLens}>
                <View style={st.searchLensCircle} />
                <View style={st.searchLensHandle} />
              </View>
              <TextInput
                style={st.searchInput}
                value={searchText}
                onChangeText={handleSearchText}
                placeholder="Search address or place"
                placeholderTextColor={COLORS.gray}
                autoFocus
                returnKeyType="search"
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchText(''); setPredictions([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={st.searchClear}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              style={st.predsScroll}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {predictions.length > 0 ? (
                <View style={st.predsBlock}>
                  {predictions.map((p, i) => (
                    <TouchableOpacity
                      key={p.placeId}
                      style={[st.predRow, i > 0 && st.predRowBorder]}
                      onPress={() => handleSelectPrediction(p)}
                      activeOpacity={0.6}
                    >
                      <View style={st.predIcon}><View style={st.predDot} /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={st.predMain} numberOfLines={1}>{p.mainText}</Text>
                        {p.secondaryText ? <Text style={st.predSub} numberOfLines={1}>{p.secondaryText}</Text> : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : searchText.trim().length >= 3 && !busy ? (
                <Text style={st.emptyHint}>No matches. Try a different search or drop a pin on the map.</Text>
              ) : null}
              {busy && <ActivityIndicator style={{ marginVertical: 12 }} color="#141414" />}
            </ScrollView>

            {/* Drop-a-pin action — pinned at bottom, always visible even with keyboard up */}
            <TouchableOpacity
              style={st.pinAction}
              onPress={() => { Keyboard.dismiss(); setPredictions([]); setAddMode('pin'); }}
              activeOpacity={0.8}
            >
              <View style={st.actionIconWrap}>
                <View style={st.pinIconHead}>
                  <Text style={st.pinIconGlyph}>✦</Text>
                </View>
                <View style={st.pinIconStem} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.actionTitle}>Drop a pin on the map</Text>
                <Text style={st.actionSub}>Pan the map and confirm precise location</Text>
              </View>
              <Text style={st.actionChevron}>›</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      )}

      {/* Bottom card */}
      {addMode === 'closed' && (
        <View style={st.bottomCard}>
          {/* Requested / driver_assigned / driver_arriving */}
          {(trip.status === 'requested' || trip.status === 'driver_assigned' || trip.status === 'driver_arriving') && (
            <>
              {trip.driver ? (
                <>
                  <DriverInfoCentered driver={trip.driver} />
                  <DriverContactRow driverName={trip.driver.name} />
                </>
              ) : (
                <Text style={st.centerText}>Finding you a driver…</Text>
              )}
              <TouchableOpacity style={st.cancelBtn} onPress={handleCancel}>
                <Text style={st.cancelBtnText}>Cancel trip</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Driver has arrived at pickup */}
          {trip.status === 'driver_arrived' && (
            <>
              {trip.driver && <DriverInfoCentered driver={trip.driver} />}
              {trip.driver && <DriverContactRow driverName={trip.driver.name} />}
              <TouchableOpacity style={[st.primaryBtn, busy && st.primaryBtnDisabled]} onPress={handleStartTrip} disabled={busy}>
                {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={st.primaryBtnText}>I'm in the car · Start trip</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={st.cancelBtn} onPress={handleCancel}>
                <Text style={st.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {/* In progress — render stops carousel + contextual CTA */}
          {trip.status === 'in_progress' && (
            <>
              <StopsCarousel
                stops={trip.stops}
                currentIndex={trip.currentStopIndex}
                scrollRef={carouselRef}
              />


              {awaitingNextDestination && (
                <TouchableOpacity style={st.primaryBtn} onPress={() => setAddMode('search')}>
                  <Text style={st.primaryBtnText}>+ Add destination</Text>
                </TouchableOpacity>
              )}

              {waitingStop && (
                <View style={{ gap: 8 }}>
                  <TouchableOpacity style={st.primaryBtn} onPress={() => setAddMode('search')} disabled={busy}>
                    <Text style={st.primaryBtnText}>Continue to new destination</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={st.secondaryBtn} onPress={handleFinish} disabled={busy}>
                    <Text style={st.secondaryBtnText}>Finish ride here</Text>
                  </TouchableOpacity>
                </View>
              )}

              {currentStop && currentStop.status === 'en_route' && (
                <TouchableOpacity style={st.secondaryBtn} onPress={handleFinish} disabled={busy}>
                  <Text style={st.secondaryBtnText}>Finish ride now</Text>
                </TouchableOpacity>
              )}

              {trip.stops.length === 0 && (
                <TouchableOpacity style={st.cancelBtn} onPress={handleCancel}>
                  <Text style={st.cancelBtnText}>Cancel trip</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Finished — rating + tip + summary */}
          {trip.status === 'finished' && (() => {
            const tipAmount = computeTipAmount(trip.fare.total);
            const totalWithTip = trip.fare.total + tipAmount;
            return (
              <ScrollView style={{ maxHeight: 560 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <Text style={st.completedTitle}>Trip Completed!</Text>

                <View style={st.completedSummary}>
                  <View style={st.completedRow}><Text style={st.completedLabel}>Stops</Text><Text style={st.completedValue}>{trip.stops.length}</Text></View>
                  {trip.driver && (<>
                    <View style={st.completedRow}><Text style={st.completedLabel}>Driver</Text><Text style={st.completedValue} numberOfLines={1}>{trip.driver.name}</Text></View>
                    <View style={st.completedRow}><Text style={st.completedLabel}>Vehicle</Text><Text style={st.completedValue} numberOfLines={1}>{trip.driver.vehicleMake} {trip.driver.vehicleModel}</Text></View>
                  </>)}
                  <View style={st.completedRow}><Text style={st.completedLabel}>Driving</Text><Text style={st.completedValue}>{currSymbol}{trip.fare.legs.toFixed(2)}</Text></View>
                  <View style={st.completedRow}><Text style={st.completedLabel}>Waiting</Text><Text style={st.completedValue}>{currSymbol}{trip.fare.waiting.toFixed(2)}</Text></View>
                  {tipAmount > 0 && (
                    <View style={st.completedRow}><Text style={st.completedLabel}>Tip</Text><Text style={st.completedValue}>{currSymbol}{tipAmount.toFixed(2)}</Text></View>
                  )}
                  <View style={st.summaryDivider} />
                  <View style={st.completedRow}>
                    <Text style={[st.completedLabel, st.completedTotalLabel]}>Total</Text>
                    <Text style={[st.completedValue, st.completedTotalValue]}>{currSymbol}{totalWithTip.toFixed(2)}</Text>
                  </View>
                </View>

                <Text style={st.rateLabel}>Rate your chauffeur</Text>
                <View style={st.starsRow}>
                  {[1, 2, 3, 4, 5].map(star => (
                    <TouchableOpacity key={star} onPress={() => setRating(star)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                      <Text style={[st.star, star <= rating && st.starActive]}>★</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={st.tipLabel}>Add a tip</Text>
                <View style={st.tipChipsRow}>
                  {([
                    { key: 'none',   label: 'No tip' },
                    { key: 'p10',    label: '10%' },
                    { key: 'p15',    label: '15%' },
                    { key: 'p20',    label: '20%' },
                    { key: 'custom', label: 'Custom' },
                  ] as const).map(c => (
                    <TouchableOpacity
                      key={c.key}
                      style={[st.tipChip, tipPreset === c.key && st.tipChipActive]}
                      onPress={() => setTipPreset(c.key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[st.tipChipText, tipPreset === c.key && st.tipChipTextActive]}>{c.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {tipPreset === 'custom' && (
                  <View style={st.customTipRow}>
                    <Text style={st.customTipSymbol}>{currSymbol}</Text>
                    <TextInput
                      style={st.customTipInput}
                      value={customTipText}
                      onChangeText={setCustomTipText}
                      placeholder="0.00"
                      placeholderTextColor={COLORS.gray}
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                    />
                  </View>
                )}

                {tipPreset !== 'none' && tipAmount > 0 && (
                  <Text style={st.tipPreview}>Tip: {currSymbol}{tipAmount.toFixed(2)}</Text>
                )}

                <TouchableOpacity style={[st.primaryBtn, busy && st.primaryBtnDisabled, { marginTop: 8 }]} onPress={handleDone} disabled={busy}>
                  {busy ? <ActivityIndicator color={COLORS.white} /> : <Text style={st.primaryBtnText}>CONFIRM</Text>}
                </TouchableOpacity>
              </ScrollView>
            );
          })()}

          {/* Cancelled */}
          {trip.status === 'cancelled' && (
            <>
              <Text style={st.summaryTitle}>Trip cancelled</Text>
              <TouchableOpacity style={st.primaryBtn} onPress={handleDone}>
                <Text style={st.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ── Small components ─────────────────────────────────────────────────────────

// ── Monochrome line icons (replaces system emoji glyphs) ─────────────────────

function CallIcon({ size = 22, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return <Text style={{ fontSize: size, color, fontWeight: '700' }}>{'☎︎'}</Text>;
}

function MessageIcon({ size = 22, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return <Text style={{ fontSize: size, color, fontWeight: '700' }}>{'✉︎'}</Text>;
}

function HelpIcon({ size = 22, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return <Text style={{ fontSize: size, color, fontWeight: '700' }}>?</Text>;
}

const STOP_CARD_HEIGHT = 84;

function StopsCarousel({
  stops,
  currentIndex,
  scrollRef,
}: {
  stops: ChauffeurStop[];
  currentIndex: number;
  scrollRef: React.RefObject<ScrollView>;
}) {
  const stCarStyles = getCarStyles();
  const [visibleIndex, setVisibleIndex] = useState(Math.max(0, currentIndex));

  // Snap to current stop when the active index changes (new stop added, or stop advanced).
  useEffect(() => {
    if (!scrollRef.current || currentIndex < 0) return;
    scrollRef.current.scrollTo({ y: currentIndex * STOP_CARD_HEIGHT, animated: true });
    setVisibleIndex(currentIndex);
  }, [currentIndex, scrollRef]);

  if (stops.length === 0) {
    return <Text style={stCarStyles.empty}>No destinations yet. Tell us where to first.</Text>;
  }

  return (
    <View style={stCarStyles.wrap}>
      <ScrollView
        ref={scrollRef}
        style={{ height: STOP_CARD_HEIGHT }}
        showsVerticalScrollIndicator={false}
        snapToInterval={STOP_CARD_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        nestedScrollEnabled
        scrollEventThrottle={32}
        onScroll={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / STOP_CARD_HEIGHT);
          const clamped = Math.max(0, Math.min(stops.length - 1, idx));
          if (clamped !== visibleIndex) setVisibleIndex(clamped);
        }}
      >
        {stops.map((s, i) => {
          const isCurrent = i === currentIndex;
          const isCompleted = s.status === 'completed';
          const badgeStyle =
            isCompleted ? stCarStyles.badgeDone :
            isCurrent   ? stCarStyles.badgeActive :
                          stCarStyles.badgeIdle;
          const statusText =
            s.status === 'en_route' ? 'Next destination' :
            s.status === 'arrived'  ? 'Waiting here' :
                                      'Completed';
          return (
            <View key={s.id} style={stCarStyles.card}>
              <View style={[stCarStyles.badge, badgeStyle]}>
                <Text style={stCarStyles.badgeText}>{isCompleted ? '✓' : String(i + 1)}</Text>
              </View>
              <View style={stCarStyles.body}>
                <Text style={stCarStyles.addr} numberOfLines={2}>{s.address}</Text>
                <Text style={stCarStyles.sub}>
                  {statusText}
                  {s.legDistanceKm > 0 ? ` · ${s.legDistanceKm.toFixed(1)} km` : ''}
                </Text>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {stops.length > 1 && (
        <View style={stCarStyles.indicatorCol}>
          {stops.map((_, i) => (
            <View
              key={i}
              style={[stCarStyles.indicatorDot, i === visibleIndex && stCarStyles.indicatorDotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const stSummaryStyles = getSummaryStyles();
  return (
    <View style={stSummaryStyles.row}>
      <Text style={[stSummaryStyles.label, bold && stSummaryStyles.bold]}>{label}</Text>
      <Text style={[stSummaryStyles.value, bold && stSummaryStyles.bold]}>{value}</Text>
    </View>
  );
}

function DriverInfoCentered({ driver }: { driver: { name: string; vehicleMake: string; vehicleModel: string; vehiclePlate: string } }) {
  const stDriverStyles = getDriverStyles();
  return (
    <View style={stDriverStyles.wrap}>
      <View style={stDriverStyles.avatar}>
        <Text style={stDriverStyles.avatarText}>{driver.name.charAt(0)}</Text>
      </View>
      <Text style={stDriverStyles.name}>{driver.name}</Text>
      <Text style={stDriverStyles.car}>{driver.vehicleMake} {driver.vehicleModel}</Text>
      <Text style={stDriverStyles.plate}>{driver.vehiclePlate}</Text>
    </View>
  );
}

function DriverContactRow({ driverName }: { driverName: string }) {
  const stDriverStyles = getDriverStyles();
  return (
    <View style={stDriverStyles.contactRow}>
      <TouchableOpacity
        style={stDriverStyles.contactBtn}
        onPress={() => Alert.alert('Call driver', `Calling ${driverName}…`)}
        activeOpacity={0.8}
      >
        <CallIcon size={20} />
        <Text style={stDriverStyles.contactLabel}>Call</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={stDriverStyles.contactBtn}
        onPress={() => Alert.alert('Message driver', `Messaging ${driverName}…`)}
        activeOpacity={0.8}
      >
        <MessageIcon size={20} />
        <Text style={stDriverStyles.contactLabel}>Message</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusLabel(status: string, waiting: boolean): string {
  if (status === 'requested') return 'Requesting chauffeur…';
  if (status === 'driver_assigned') return 'Driver assigned';
  if (status === 'driver_arriving') return 'Driver on the way';
  if (status === 'driver_arrived') return 'Driver has arrived';
  if (status === 'in_progress' && waiting) return 'Waiting at stop';
  if (status === 'in_progress') return 'On trip';
  if (status === 'finished') return 'Trip complete';
  if (status === 'cancelled') return 'Trip cancelled';
  return status;
}

function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Styles ───────────────────────────────────────────────────────────────────

function getStyles() { return StyleSheet.create({
  container: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  pin: { alignItems: 'center' },
  pinHead: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  pinNeedle: { width: 3, height: 16, backgroundColor: COLORS.textPrimary },
  dropOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 100 },
  dropUI: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'space-between', zIndex: 101 },
  dropTopBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8 },
  dropHint: { flex: 1, backgroundColor: '#FFFFFFEE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3 },
  dropHintText: { fontSize: 13, color: COLORS.textPrimary, fontWeight: '600' },
  dropBottomBar: { paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.textPrimary, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
  backText: { fontSize: 22, fontWeight: '600', color: COLORS.background },
  confirmBtn: { backgroundColor: '#d9c0a4', borderRadius: BORDER_RADIUS.md, paddingVertical: 18, alignItems: 'center' },
  confirmBtnText: { color: '#000000', fontSize: 14, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  mapAddrCard: { backgroundColor: COLORS.grayLight, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 4, maxWidth: 160, borderWidth: 1.5, borderColor: COLORS.textPrimary, alignSelf: 'center' },
  mapAddrText: { fontSize: 12, fontWeight: '600', color: COLORS.textPrimary },
  liveDriverMarker: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.textPrimary, borderWidth: 3, borderColor: COLORS.white, justifyContent: 'center', alignItems: 'center' },
  liveDriverIcon: { fontSize: 14, color: COLORS.background },

  headerOverlay: { paddingHorizontal: 16, paddingBottom: 8 },
  headerCard: { backgroundColor: COLORS.grayLight, borderRadius: 16, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 8 },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.textPrimary, justifyContent: 'center', alignItems: 'center' },
  headerAvatarPending: { backgroundColor: COLORS.grayLight },
  headerAvatarText: { fontSize: 17, fontWeight: '700', color: COLORS.background },
  headerDriverCol: { flex: 1 },
  headerDriverName: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  headerVehicleText: { fontSize: 12, color: COLORS.textSecondary, flexShrink: 1 },
  headerMetaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: COLORS.disabled },
  headerPlate: { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: 0.5 },
  headerFareCol: { alignItems: 'flex-end' },
  fareLabel: { fontSize: 10, color: COLORS.gray, letterSpacing: 1.5, fontWeight: '700' },
  fareValue: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginTop: 2 },

  headerStatusBar: { alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: COLORS.grayLight, marginTop: 12, paddingVertical: 10 },
  headerStatusCentered: { fontSize: 13, fontWeight: '700', color: COLORS.textPrimary, letterSpacing: 0.3 },
  headerWaitingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerWaitingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.warning },
  headerWaitingLabel: { fontSize: 11, fontWeight: '700', color: COLORS.warning, letterSpacing: 1.5 },
  headerWaitingTime: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, marginLeft: 2, fontVariant: ['tabular-nums'] },

  headerDrawer: { borderTopWidth: 1, borderTopColor: COLORS.grayLight, paddingTop: 14, paddingBottom: 4 },
  headerActionsRow: { flexDirection: 'row', gap: 10 },
  headerActionBtn: { flex: 1, backgroundColor: COLORS.grayLight, borderRadius: 12, paddingVertical: 12, alignItems: 'center', gap: 6 },
  headerActionBtnDisabled: { opacity: 0.4 },
  headerActionLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textPrimary },
  headerDrawerMeta: { fontSize: 11, color: COLORS.gray, textAlign: 'center', marginTop: 10, letterSpacing: 0.3 },

  headerChevronWrap: { alignItems: 'center', paddingTop: 6, paddingBottom: 2 },
  headerChevronPill: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: COLORS.textPrimary, paddingHorizontal: 22, paddingVertical: 4, borderRadius: 10, minWidth: 56, alignItems: 'center', justifyContent: 'center' },
  headerChevron: { fontSize: 13, color: COLORS.textPrimary, fontWeight: '800' },

  bottomCard: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#000000', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 30, gap: 10, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.textPrimary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700', color: COLORS.background },
  driverName: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  driverCar: { fontSize: 12, color: '#888888' },
  driverPlate: { fontSize: 11, fontWeight: '600', color: '#FFFFFF', letterSpacing: 1, marginTop: 1 },
  actionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.grayLight, justifyContent: 'center', alignItems: 'center' },
  actionIcon: { fontSize: 16, color: COLORS.textPrimary },
  centerText: { textAlign: 'center', fontSize: 15, fontWeight: '600', color: '#FFFFFF', paddingVertical: 12 },
  enRouteText: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center' },

  primaryBtn: { backgroundColor: '#d9c0a4', borderRadius: BORDER_RADIUS.md, paddingVertical: 18, alignItems: 'center', minHeight: 56, justifyContent: 'center' },
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#000000', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  secondaryBtn: { backgroundColor: COLORS.grayLight, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  secondaryBtnText: { color: COLORS.textPrimary, fontWeight: '700', fontSize: 14 },
  cancelBtn: { borderWidth: 1, borderColor: COLORS.error, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  cancelBtnText: { color: COLORS.error, fontWeight: '600', fontSize: 14 },

  summaryTitle: { fontSize: 18, fontWeight: '800', color: COLORS.textPrimary, textAlign: 'center' },
  summaryBox: { backgroundColor: COLORS.grayLight, borderRadius: 10, padding: 12, gap: 6 },
  summaryDivider: { height: 1, backgroundColor: COLORS.disabled, marginVertical: 4 },

  // Completion panel (mirrors HomeScreen's Trip Completed card, with tip added)
  completedTitle: { fontSize: 22, fontWeight: '800', color: COLORS.success, textAlign: 'center', marginBottom: 14 },
  completedSummary: { backgroundColor: COLORS.grayLight, borderRadius: 12, padding: 12, marginBottom: 16 },
  completedRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  completedLabel: { fontSize: 13, color: COLORS.textSecondary },
  completedValue: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary, maxWidth: '60%', textAlign: 'right' },
  completedTotalLabel: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
  completedTotalValue: { fontSize: 16, fontWeight: '800', color: COLORS.textPrimary },

  rateLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center', marginBottom: 8 },
  starsRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 18 },
  star: { fontSize: 38, color: COLORS.border },
  starActive: { color: COLORS.warning },

  tipLabel: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary, textAlign: 'center', marginBottom: 10 },
  tipChipsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 10 },
  tipChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.grayLight },
  tipChipActive: { backgroundColor: '#d9c0a4', borderColor: '#d9c0a4' },
  tipChipText: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary },
  tipChipTextActive: { color: '#000000' },
  customTipRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, height: 48, gap: 6, marginBottom: 8 },
  customTipSymbol: { fontSize: 16, fontWeight: '700', color: COLORS.textSecondary },
  customTipInput: { flex: 1, fontSize: 16, color: COLORS.textPrimary, paddingVertical: 0 },
  tipPreview: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'center', marginBottom: 8 },

  searchKav: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  searchPanel: { backgroundColor: COLORS.grayLight, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 20, paddingBottom: 28, shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.2, shadowRadius: 18, elevation: 16 },
  searchHandle: { width: 42, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: 'center', marginBottom: 14 },
  searchHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  searchTitle: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.2 },
  searchSubtitle: { fontSize: 13, color: COLORS.textSecondary, marginTop: 3 },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.grayLight, justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  closeBtnText: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '700' },

  searchField: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.grayLight, borderRadius: 14, paddingHorizontal: 14, height: 52, gap: 10, marginBottom: 14 },
  searchLens: { width: 18, height: 18, justifyContent: 'center', alignItems: 'center' },
  searchLensCircle: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.8, borderColor: COLORS.textSecondary, position: 'absolute', top: 0, left: 0 },
  searchLensHandle: { width: 1.8, height: 7, backgroundColor: COLORS.textSecondary, position: 'absolute', bottom: 0, right: 1, transform: [{ rotate: '-45deg' }] },
  searchInput: { flex: 1, fontSize: 16, color: COLORS.textPrimary, paddingVertical: 0 },
  searchClear: { fontSize: 14, color: COLORS.textSecondary, fontWeight: '700', paddingHorizontal: 4 },

  predsScroll: { maxHeight: 220, marginBottom: 10 },
  predsBlock: { backgroundColor: COLORS.grayLight, borderRadius: 14, paddingVertical: 4 },
  predRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 4 },
  predRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.grayLight },
  predIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.grayLight, justifyContent: 'center', alignItems: 'center' },
  predDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.textPrimary },
  predMain: { fontSize: 15, fontWeight: '600', color: COLORS.textPrimary },
  predSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  emptyHint: { fontSize: 13, color: COLORS.gray, textAlign: 'center', paddingVertical: 20, paddingHorizontal: 8, lineHeight: 18 },

  pinAction: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: COLORS.grayLight, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 14 },
  actionIconWrap: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  pinIconHead: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.textPrimary, justifyContent: 'center', alignItems: 'center' },
  pinIconGlyph: { fontSize: 11, color: COLORS.background },
  pinIconStem: { width: 2, height: 6, backgroundColor: COLORS.textPrimary, marginTop: -1 },
  actionTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  actionSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  actionChevron: { fontSize: 22, color: COLORS.gray, marginLeft: 4 },
}); }

function getCarStyles() { return StyleSheet.create({
  wrap: { flexDirection: 'row', marginBottom: 4, alignItems: 'center' },
  empty: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', paddingVertical: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, height: STOP_CARD_HEIGHT, paddingHorizontal: 4, paddingVertical: 10 },
  body: { flex: 1, justifyContent: 'center' },
  badge: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  badgeIdle: { backgroundColor: COLORS.border },
  badgeActive: { backgroundColor: '#d9c0a4' },
  badgeDone: { backgroundColor: COLORS.success },
  badgeText: { fontSize: 13, fontWeight: '700', color: '#000000' },
  addr: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary, lineHeight: 20 },
  sub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  indicatorCol: { width: 8, marginLeft: 8, gap: 4, alignItems: 'center', justifyContent: 'center' },
  indicatorDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: COLORS.border },
  indicatorDotActive: { width: 6, height: 18, borderRadius: 3, backgroundColor: '#d9c0a4' },
}); }

function getSummaryStyles() { return StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  label: { fontSize: 13, color: COLORS.textSecondary },
  value: { fontSize: 13, fontWeight: '600', color: COLORS.textPrimary },
  bold: { fontSize: 15, fontWeight: '800', color: COLORS.textPrimary },
}); }

function getDriverStyles() { return StyleSheet.create({
  wrap: { alignItems: 'center', paddingVertical: 6, gap: 4 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#d9c0a4', justifyContent: 'center', alignItems: 'center', marginBottom: 6 },
  avatarText: { fontSize: 24, fontWeight: '700', color: '#000000' },
  name: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.2 },
  car: { fontSize: 13, color: '#888888' },
  plate: { fontSize: 12, fontWeight: '700', color: '#FFFFFF', letterSpacing: 1.2, marginTop: 2 },
  contactRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  contactBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#111111', borderRadius: 14, paddingVertical: 14 },
  contactLabel: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
}); }
