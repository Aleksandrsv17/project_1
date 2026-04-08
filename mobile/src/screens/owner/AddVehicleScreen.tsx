import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
  Image,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE, MapPressEvent } from 'react-native-maps';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useAddVehicle } from '../../hooks/useVehicles';
import { useLocation } from '../../hooks/useLocation';
import { reverseGeocode, searchPlaces, getPlaceDetails, PlacePrediction } from '../../api/maps';
import { uploadVehicleImages, getLibraryImages, LibraryImage } from '../../api/uploads';
import { COLORS, SPACING, BORDER_RADIUS, VEHICLE_CATEGORIES, DEFAULT_REGION } from '../../utils/constants';
import { AddVehiclePayload } from '../../api/vehicles';
import { OwnerStackParamList } from '../../navigation/OwnerNavigator';

type AddVehicleScreenProps = {
  navigation: NativeStackNavigationProp<OwnerStackParamList, 'AddVehicle'>;
};

const STEPS = ['Vehicle Info', 'Photos', 'Pricing', 'Availability'];

const FUEL_TYPES = ['petrol', 'diesel', 'electric', 'hybrid'] as const;
const TRANSMISSION_TYPES = ['automatic', 'manual'] as const;

const COUNTRIES = [
  'United Arab Emirates', 'Saudi Arabia', 'Qatar', 'Bahrain', 'Kuwait', 'Oman',
  'United States', 'United Kingdom', 'Germany', 'France', 'Italy', 'Spain',
  'Switzerland', 'Netherlands', 'Turkey', 'Russia', 'India', 'China', 'Japan',
  'Australia', 'Canada', 'Brazil', 'South Africa', 'Egypt', 'Morocco',
  'Singapore', 'Malaysia', 'Thailand', 'Indonesia', 'South Korea',
];

const COMMON_FEATURES = [
  'GPS Navigation', 'Bluetooth', 'Apple CarPlay', 'Android Auto',
  'Leather Seats', 'Sunroof', 'Heated Seats', 'Parking Sensors',
  'Rear Camera', 'Cruise Control', 'Climate Control', '360 Camera',
];

export function AddVehicleScreen({ navigation }: AddVehicleScreenProps) {
  const styles = getStyles();
  const [currentStep, setCurrentStep] = useState(0);
  const addVehicleMutation = useAddVehicle();
  const { location, address: detectedAddress } = useLocation();

  // Step 1: Vehicle Info
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [color, setColor] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [seats, setSeats] = useState('5');
  const [category, setCategory] = useState('sedan');
  const [transmission, setTransmission] = useState<'automatic' | 'manual'>('automatic');
  const [fuelType, setFuelType] = useState<'petrol' | 'diesel' | 'electric' | 'hybrid'>('petrol');
  const [description, setDescription] = useState('');

  // Step 2: Photos
  const [images, setImages] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
  const [libraryMakes, setLibraryMakes] = useState<string[]>([]);
  const [libraryFilter, setLibraryFilter] = useState<string>('all');
  const [selectedLibraryImages, setSelectedLibraryImages] = useState<Set<string>>(new Set());

  // Step 3: Pricing
  const [pricePerHour, setPricePerHour] = useState('');
  const [pricePerDay, setPricePerDay] = useState('');
  const [chauffeurAvailable, setChauffeurAvailable] = useState(false);
  const [chauffeurFeePerHour, setChauffeurFeePerHour] = useState('');

  // Step 4: Features & Location
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [pickupAddress, setPickupAddress] = useState(detectedAddress ?? '');
  const [pickupCity, setPickupCity] = useState('Dubai');
  const [pickupCountry, setPickupCountry] = useState('United Arab Emirates');
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [addressPredictions, setAddressPredictions] = useState<any[]>([]);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pinCoords, setPinCoords] = useState<{ latitude: number; longitude: number }>(
    location ? { latitude: location.latitude, longitude: location.longitude } : { latitude: 25.2048, longitude: 55.2708 }
  );

  function validateStep(): boolean {
    switch (currentStep) {
      case 0:
        if (!make.trim() || !model.trim() || !year.trim() || !licensePlate.trim()) {
          Alert.alert('Missing Info', 'Please fill in all required vehicle information.');
          return false;
        }
        if (isNaN(Number(year)) || Number(year) < 2000 || Number(year) > 2030) {
          Alert.alert('Invalid Year', 'Please enter a valid year (2000-2030).');
          return false;
        }
        return true;
      case 1:
        // Photos are optional but encouraged
        return true;
      case 2:
        if (!pricePerHour.trim() || !pricePerDay.trim()) {
          Alert.alert('Missing Pricing', 'Please enter hourly and daily rates.');
          return false;
        }
        if (isNaN(Number(pricePerHour)) || Number(pricePerHour) <= 0) {
          Alert.alert('Invalid Price', 'Please enter a valid hourly price.');
          return false;
        }
        return true;
      default:
        return true;
    }
  }

  function handleNext() {
    if (!validateStep()) return;
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    } else {
      handleSubmit();
    }
  }

  function handleBack() {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    } else {
      navigation.goBack();
    }
  }

  function handleAddressSearch(text: string) {
    setPickupAddress(text);
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    if (text.trim().length < 3) { setAddressPredictions([]); return; }
    addressDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(text, location ?? undefined);
        setAddressPredictions(results);
      } catch { setAddressPredictions([]); }
    }, 300);
  }

  async function handleSelectAddress(p: PlacePrediction) {
    setAddressPredictions([]);
    try {
      const d = await getPlaceDetails(p.placeId);
      setPickupAddress(p.description);
      setPinCoords({ latitude: d.latitude, longitude: d.longitude });
      if (d.formattedAddress) {
        // Try to extract city from address
        const parts = d.formattedAddress.split(',').map((s: string) => s.trim());
        if (parts.length >= 2) setPickupCity(parts[parts.length - 2]);
      }
    } catch {}
  }

  function toggleFeature(feature: string) {
    setSelectedFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]
    );
  }

  async function handlePickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photo library.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 8 - images.length,
      quality: 0.8,
    });

    if (result.canceled || result.assets.length === 0) return;

    setIsUploading(true);
    try {
      const uris = result.assets.map(a => a.uri);
      const urls = await uploadVehicleImages(uris);
      setImages(prev => [...prev, ...urls].slice(0, 8));
    } catch (err) {
      Alert.alert('Upload Failed', 'Could not upload images. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleTakePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission Required', 'Please allow camera access.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (result.canceled || result.assets.length === 0) return;

    setIsUploading(true);
    try {
      const urls = await uploadVehicleImages([result.assets[0].uri]);
      setImages(prev => [...prev, ...urls].slice(0, 8));
    } catch (err) {
      Alert.alert('Upload Failed', 'Could not upload image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleOpenLibrary() {
    setShowLibrary(true);
    setSelectedLibraryImages(new Set());
    try {
      const data = await getLibraryImages();
      setLibraryImages(data.images);
      setLibraryMakes(data.makes);
    } catch {
      // Library might be empty, that's ok
    }
  }

  function toggleLibraryImage(url: string) {
    setSelectedLibraryImages(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else if (images.length + next.size < 8) next.add(url);
      return next;
    });
  }

  function confirmLibrarySelection() {
    const selected = Array.from(selectedLibraryImages);
    setImages(prev => [...prev, ...selected].slice(0, 8));
    setShowLibrary(false);
    setSelectedLibraryImages(new Set());
  }

  function handleAddPhoto() {
    Alert.alert('Add Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: handleTakePhoto },
      { text: 'Choose from Gallery', onPress: handlePickFromGallery },
      { text: 'Browse Car Library', onPress: handleOpenLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleSubmit() {
    const payload: AddVehiclePayload = {
      make: make.trim(),
      model: model.trim(),
      year: Number(year),
      category: category as AddVehiclePayload['category'],
      color: color.trim() || 'White',
      licensePlate: licensePlate.trim().toUpperCase(),
      seats: Number(seats),
      transmission,
      fuelType,
      pricePerHour: Number(pricePerHour),
      pricePerDay: Number(pricePerDay),
      chauffeurAvailable,
      chauffeurFeePerHour: chauffeurAvailable ? Number(chauffeurFeePerHour) : undefined,
      images: images.length > 0 ? images : ['https://via.placeholder.com/300x200?text=Vehicle'],
      description: description.trim(),
      location: {
        latitude: pinCoords.latitude,
        longitude: pinCoords.longitude,
        address: pickupAddress.trim() || detectedAddress || 'Dubai, UAE',
        city: pickupCity.trim() || 'Dubai',
      },
      features: selectedFeatures,
    };

    try {
      await addVehicleMutation.mutateAsync(payload);

      // Reset all fields
      setCurrentStep(0);
      setMake(''); setModel(''); setYear(''); setColor('');
      setLicensePlate(''); setSeats('5'); setCategory('sedan');
      setTransmission('automatic'); setFuelType('petrol'); setDescription('');
      setImages([]); setPricePerHour(''); setPricePerDay('');
      setChauffeurAvailable(false); setChauffeurFeePerHour('');
      setSelectedFeatures([]); setPickupAddress(detectedAddress ?? ''); setPickupCity('Dubai');

      Alert.alert(
        'Vehicle Added! 🎉',
        'Your vehicle has been listed and is now visible to customers.',
        [{ text: 'View My Fleet', onPress: () => navigation.goBack() }]
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add vehicle.';
      Alert.alert('Error', message);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Text style={styles.backIcon}>{currentStep === 0 ? '✕' : '←'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Vehicle</Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Step Progress */}
      <View style={styles.stepProgress}>
        {STEPS.map((step, idx) => (
          <View key={step} style={styles.stepItem}>
            <View style={[styles.stepDot, idx <= currentStep && styles.stepDotActive]}>
              {idx < currentStep ? (
                <Text style={styles.stepCheckmark}>✓</Text>
              ) : (
                <Text style={[styles.stepNumber, idx === currentStep && styles.stepNumberActive]}>
                  {idx + 1}
                </Text>
              )}
            </View>
            {idx < STEPS.length - 1 && (
              <View style={[styles.stepLine, idx < currentStep && styles.stepLineActive]} />
            )}
          </View>
        ))}
      </View>
      <Text style={styles.stepLabel}>{STEPS[currentStep]}</Text>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Step 0: Vehicle Info */}
        {currentStep === 0 && (
          <View style={styles.stepContent}>
            <Field label="Make *" value={make} onChangeText={setMake} placeholder="e.g. Toyota, BMW" />
            <Field label="Model *" value={model} onChangeText={setModel} placeholder="e.g. Camry, X5" />

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Field label="Year *" value={year} onChangeText={setYear} placeholder="2023" keyboardType="numeric" />
              </View>
              <View style={styles.halfField}>
                <Field label="Seats" value={seats} onChangeText={setSeats} placeholder="5" keyboardType="numeric" />
              </View>
            </View>

            <Field label="Color" value={color} onChangeText={setColor} placeholder="e.g. White, Black" />
            <Field label="License Plate *" value={licensePlate} onChangeText={setLicensePlate} placeholder="e.g. A 12345" autoCapitalize="characters" />

            <Text style={styles.fieldLabel}>Category</Text>
            <View style={styles.chipGrid}>
              {VEHICLE_CATEGORIES.filter((c) => c.value !== 'all').map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[styles.chip, category === cat.value && styles.chipActive]}
                  onPress={() => setCategory(cat.value)}
                >
                  <Text style={[styles.chipText, category === cat.value && styles.chipTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Transmission</Text>
            <View style={styles.chipRow}>
              {TRANSMISSION_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, transmission === t && styles.chipActive]}
                  onPress={() => setTransmission(t)}
                >
                  <Text style={[styles.chipText, transmission === t && styles.chipTextActive]}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Fuel Type</Text>
            <View style={styles.chipGrid}>
              {FUEL_TYPES.map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.chip, fuelType === f && styles.chipActive]}
                  onPress={() => setFuelType(f)}
                >
                  <Text style={[styles.chipText, fuelType === f && styles.chipTextActive]}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput
              style={[styles.input, styles.descriptionInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Describe your vehicle, its condition, and any special features..."
              placeholderTextColor={COLORS.gray}
              multiline
              numberOfLines={4}
            />
          </View>
        )}

        {/* Step 1: Photos */}
        {currentStep === 1 && (
          <View style={styles.stepContent}>
            <Text style={styles.stepIntro}>
              Add high-quality photos to attract more customers. The first photo will be the cover image.
            </Text>

            <View style={styles.photoGrid}>
              {images.map((uri, idx) => (
                <View key={idx} style={styles.photoItem}>
                  <Image source={{ uri }} style={styles.photoThumb} resizeMode="cover" />
                  <TouchableOpacity
                    style={styles.photoDelete}
                    onPress={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Text style={styles.photoDeleteText}>✕</Text>
                  </TouchableOpacity>
                  {idx === 0 && (
                    <View style={styles.coverBadge}>
                      <Text style={styles.coverBadgeText}>Cover</Text>
                    </View>
                  )}
                </View>
              ))}
              {images.length < 8 && (
                <TouchableOpacity style={styles.addPhotoButton} onPress={handleAddPhoto}>
                  <Text style={styles.addPhotoIcon}>📷</Text>
                  <Text style={styles.addPhotoText}>Add Photo</Text>
                </TouchableOpacity>
              )}
            </View>

            {isUploading && (
              <View style={styles.uploadingRow}>
                <ActivityIndicator size="small" color={COLORS.accent} />
                <Text style={styles.uploadingText}>Uploading...</Text>
              </View>
            )}

            <Text style={styles.photoHint}>
              {images.length}/8 photos · Recommended: exterior, interior, dashboard
            </Text>
          </View>
        )}

        {/* Library Modal */}
        <Modal visible={showLibrary} animationType="slide" presentationStyle="pageSheet">
          <SafeAreaView style={styles.libraryModal} edges={['top']}>
            <View style={styles.libraryHeader}>
              <TouchableOpacity onPress={() => setShowLibrary(false)}>
                <Text style={styles.libraryClose}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.libraryTitle}>Car Photo Library</Text>
              <TouchableOpacity onPress={confirmLibrarySelection}>
                <Text style={styles.libraryDone}>
                  Done ({selectedLibraryImages.size})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Make filter */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.libraryFilterRow}
            >
              <TouchableOpacity
                style={[styles.libraryFilterChip, libraryFilter === 'all' && styles.libraryFilterActive]}
                onPress={() => setLibraryFilter('all')}
              >
                <Text style={[styles.libraryFilterText, libraryFilter === 'all' && styles.libraryFilterTextActive]}>All</Text>
              </TouchableOpacity>
              {libraryMakes.map(m => (
                <TouchableOpacity
                  key={m}
                  style={[styles.libraryFilterChip, libraryFilter === m && styles.libraryFilterActive]}
                  onPress={() => setLibraryFilter(m)}
                >
                  <Text style={[styles.libraryFilterText, libraryFilter === m && styles.libraryFilterTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {libraryImages.length === 0 ? (
              <View style={styles.libraryEmpty}>
                <Text style={styles.libraryEmptyIcon}>📷</Text>
                <Text style={styles.libraryEmptyText}>No library images yet</Text>
                <Text style={styles.libraryEmptySubtext}>
                  The admin will upload car photos to the library soon.
                </Text>
              </View>
            ) : (
              <FlatList
                data={libraryImages.filter(i => libraryFilter === 'all' || i.make === libraryFilter)}
                keyExtractor={(item) => item.url}
                numColumns={3}
                contentContainerStyle={styles.libraryGrid}
                renderItem={({ item }) => {
                  const isSelected = selectedLibraryImages.has(item.url);
                  return (
                    <TouchableOpacity
                      style={[styles.libraryImageItem, isSelected && styles.libraryImageSelected]}
                      onPress={() => toggleLibraryImage(item.url)}
                    >
                      <Image source={{ uri: item.url }} style={styles.libraryImageThumb} resizeMode="cover" />
                      {isSelected && (
                        <View style={styles.libraryCheckmark}>
                          <Text style={styles.libraryCheckmarkText}>✓</Text>
                        </View>
                      )}
                      <Text style={styles.libraryImageLabel} numberOfLines={1}>{item.make}</Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </SafeAreaView>
        </Modal>

        {/* Step 2: Pricing */}
        {currentStep === 2 && (
          <View style={styles.stepContent}>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Field
                  label="Price Per Hour (AED) *"
                  value={pricePerHour}
                  onChangeText={setPricePerHour}
                  placeholder="e.g. 150"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.halfField}>
                <Field
                  label="Price Per Day (AED) *"
                  value={pricePerDay}
                  onChangeText={setPricePerDay}
                  placeholder="e.g. 800"
                  keyboardType="numeric"
                />
              </View>
            </View>

            {/* Chauffeur Toggle */}
            <View style={styles.toggleCard}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleTitle}>Offer Chauffeur Service</Text>
                <Text style={styles.toggleSubtitle}>
                  Customers can book with a professional driver
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.toggle, chauffeurAvailable && styles.toggleActive]}
                onPress={() => setChauffeurAvailable((v) => !v)}
              >
                <View style={[styles.toggleThumb, chauffeurAvailable && styles.toggleThumbActive]} />
              </TouchableOpacity>
            </View>

            {chauffeurAvailable && (
              <Field
                label="Chauffeur Fee Per Hour (AED)"
                value={chauffeurFeePerHour}
                onChangeText={setChauffeurFeePerHour}
                placeholder="e.g. 80"
                keyboardType="numeric"
              />
            )}

            {/* Pricing tips */}
            <View style={styles.tipsCard}>
              <Text style={styles.tipsTitle}>💡 Pricing Tips</Text>
              <Text style={styles.tipsText}>
                • Daily rate is usually 6-8× the hourly rate{'\n'}
                • Compare with similar vehicles in your area{'\n'}
                • Competitive pricing increases your booking rate
              </Text>
            </View>
          </View>
        )}

        {/* Step 3: Features & Location */}
        {currentStep === 3 && (
          <View style={styles.stepContent}>
            <Text style={styles.fieldLabel}>Features</Text>
            <View style={styles.chipGrid}>
              {COMMON_FEATURES.map((feature) => (
                <TouchableOpacity
                  key={feature}
                  style={[styles.chip, selectedFeatures.includes(feature) && styles.chipActive]}
                  onPress={() => toggleFeature(feature)}
                >
                  <Text style={[styles.chipText, selectedFeatures.includes(feature) && styles.chipTextActive]}>
                    {feature}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Country selector */}
            <Text style={styles.fieldLabel}>Country</Text>
            <TouchableOpacity
              style={styles.locationDropdown}
              onPress={() => setShowCountryPicker(!showCountryPicker)}
            >
              <Text style={styles.locationDropdownIcon}>🌐</Text>
              <Text style={styles.locationDropdownText}>{pickupCountry}</Text>
              <Text style={styles.locationDropdownArrow}>{showCountryPicker ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showCountryPicker && (
              <View style={styles.countryPickerContainer}>
                <View style={styles.countrySearchBox}>
                  <Text style={{ fontSize: 14 }}>🔍</Text>
                  <TextInput
                    style={styles.countrySearchInput}
                    value={countrySearch}
                    onChangeText={setCountrySearch}
                    placeholder="Search country..."
                    placeholderTextColor={COLORS.gray}
                    autoFocus
                  />
                </View>
                <ScrollView style={styles.countryList} nestedScrollEnabled>
                  {COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase())).map(c => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.countryItem, pickupCountry === c && styles.countryItemActive]}
                      onPress={() => { setPickupCountry(c); setShowCountryPicker(false); setCountrySearch(''); }}
                    >
                      <Text style={[styles.countryItemText, pickupCountry === c && styles.countryItemTextActive]}>{c}</Text>
                      {pickupCountry === c && <Text style={styles.countryCheck}>✓</Text>}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Address search with autocomplete */}
            <Text style={[styles.fieldLabel, { marginTop: SPACING.md }]}>Vehicle Address</Text>
            <View style={styles.addressInputCard}>
              <View style={styles.addressDotsCol}>
                <View style={styles.addressGreenDot} />
              </View>
              <View style={{ flex: 1 }}>
                <TextInput
                  style={styles.addressInput}
                  value={pickupAddress}
                  onChangeText={handleAddressSearch}
                  placeholder="Search address..."
                  placeholderTextColor={COLORS.gray}
                />
              </View>
              {pickupAddress.length > 0 && (
                <TouchableOpacity onPress={() => { setPickupAddress(''); setAddressPredictions([]); }}>
                  <Text style={{ fontSize: 14, color: COLORS.gray, padding: 4 }}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Address predictions */}
            {addressPredictions.length > 0 && (
              <View style={styles.addressPredictions}>
                {addressPredictions.map((p: PlacePrediction) => (
                  <TouchableOpacity key={p.placeId} style={styles.addressPredRow} onPress={() => handleSelectAddress(p)}>
                    <Text style={styles.addressPredPin}>📍</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.addressPredMain} numberOfLines={1}>{p.mainText}</Text>
                      <Text style={styles.addressPredSub} numberOfLines={1}>{p.secondaryText}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Use my location button */}
            {location && (
              <TouchableOpacity
                style={styles.useLocationButton}
                onPress={() => {
                  setPickupAddress(detectedAddress ?? '');
                  setPinCoords({ latitude: location.latitude, longitude: location.longitude });
                }}
              >
                <Text style={styles.useLocationText}>📍 Use my current location</Text>
              </TouchableOpacity>
            )}

            {/* Map with pin */}
            <View style={[styles.mapPickerContainer, { marginTop: SPACING.md }]}>
              <MapView
                style={styles.mapPicker}
                provider={PROVIDER_GOOGLE}
                region={{
                  ...pinCoords,
                  latitudeDelta: 0.015,
                  longitudeDelta: 0.015,
                }}
                onPress={async (e: MapPressEvent) => {
                  const { latitude, longitude } = e.nativeEvent.coordinate;
                  setPinCoords({ latitude, longitude });
                  try {
                    const geo = await reverseGeocode(latitude, longitude);
                    setPickupAddress(geo.formattedAddress);
                    if (geo.city) setPickupCity(geo.city);
                  } catch {}
                }}
              >
                <Marker coordinate={pinCoords}>
                  <View style={styles.mapPinMarker}>
                    <Text style={styles.mapPinText}>📍</Text>
                  </View>
                </Marker>
              </MapView>
              {pickupAddress ? (
                <View style={styles.mapAddressBar}>
                  <Text style={styles.mapAddressText} numberOfLines={2}>{pickupAddress}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Navigation Buttons */}
      <View style={styles.bottomBar}>
        <SafeAreaView edges={['bottom']}>
          <View style={styles.bottomBarInner}>
            {currentStep > 0 && (
              <TouchableOpacity style={styles.prevButton} onPress={handleBack}>
                <Text style={styles.prevButtonText}>← Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[
                styles.nextButton,
                currentStep === 0 && styles.nextButtonFull,
                addVehicleMutation.isPending && styles.disabledButton,
              ]}
              onPress={handleNext}
              disabled={addVehicleMutation.isPending}
            >
              {addVehicleMutation.isPending ? (
                <ActivityIndicator color={COLORS.primary} size="small" />
              ) : (
                <Text style={styles.nextButtonText}>
                  {currentStep === STEPS.length - 1 ? 'List Vehicle 🚀' : 'Next →'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    </SafeAreaView>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad';
  autoCapitalize?: 'none' | 'words' | 'characters';
}) {
  const styles = getStyles();
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.gray}
        keyboardType={keyboardType ?? 'default'}
        autoCapitalize={autoCapitalize ?? 'words'}
        autoCorrect={false}
      />
    </View>
  );
}

function getStyles() { return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: SPACING.xs,
  },
  backIcon: {
    fontSize: 22,
    color: COLORS.textPrimary,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  headerSpacer: {
    width: 30,
  },
  stepProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xs,
    backgroundColor: COLORS.white,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepDotActive: {
    backgroundColor: COLORS.accent,
  },
  stepNumber: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  stepNumberActive: {
    color: COLORS.primary,
  },
  stepCheckmark: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '700',
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: COLORS.border,
    marginHorizontal: 4,
  },
  stepLineActive: {
    backgroundColor: COLORS.accent,
  },
  stepLabel: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    backgroundColor: COLORS.white,
    paddingBottom: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  content: {
    padding: SPACING.md,
    paddingBottom: 120,
  },
  stepContent: {
    gap: 0,
  },
  stepIntro: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
    marginBottom: SPACING.md,
  },
  fieldContainer: {
    marginBottom: SPACING.md,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginBottom: SPACING.xs,
    marginTop: SPACING.xs,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: Platform.OS === 'ios' ? 13 : 10,
    fontSize: 15,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.white,
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: SPACING.md,
  },
  row: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  halfField: {
    flex: 1,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  chipRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  // Photos
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  photoItem: {
    position: 'relative',
    width: 100,
    height: 80,
  },
  photoThumb: {
    width: 100,
    height: 80,
    borderRadius: BORDER_RADIUS.md,
  },
  photoDelete: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoDeleteText: {
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '700',
  },
  coverBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: COLORS.accent,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  coverBadgeText: {
    color: COLORS.primary,
    fontSize: 9,
    fontWeight: '700',
  },
  addPhotoButton: {
    width: 100,
    height: 80,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    borderRadius: BORDER_RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  addPhotoIcon: {
    fontSize: 22,
  },
  addPhotoText: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  photoHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  // Pricing
  toggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.md,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  toggleSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  toggle: {
    width: 48,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: COLORS.accent,
  },
  toggleThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.white,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
  tipsCard: {
    backgroundColor: '#eff6ff',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginTop: SPACING.sm,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: SPACING.xs,
  },
  tipsText: {
    fontSize: 13,
    color: '#1e40af',
    lineHeight: 20,
  },
  useLocationButton: {
    backgroundColor: '#eff6ff',
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  useLocationText: {
    color: '#1e40af',
    fontWeight: '600',
    fontSize: 14,
  },
  mapPickerContainer: {
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  mapPicker: {
    width: '100%',
    height: 200,
  },
  mapPinMarker: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 6,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  mapPinText: {
    fontSize: 22,
  },
  mapAddressBar: {
    backgroundColor: COLORS.white,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  mapAddressText: {
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  locationDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    gap: SPACING.sm,
  },
  locationDropdownIcon: { fontSize: 16 },
  locationDropdownText: { flex: 1, fontSize: 15, color: COLORS.textPrimary, fontWeight: '500' },
  locationDropdownArrow: { fontSize: 12, color: COLORS.textSecondary },
  countryPickerContainer: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    marginTop: SPACING.xs,
    maxHeight: 250,
    overflow: 'hidden',
  },
  countrySearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
    gap: SPACING.sm,
  },
  countrySearchInput: { flex: 1, fontSize: 14, color: COLORS.textPrimary },
  countryList: { maxHeight: 200 },
  countryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
  },
  countryItemActive: { backgroundColor: '#fefce8' },
  countryItemText: { fontSize: 15, color: COLORS.textPrimary },
  countryItemTextActive: { color: COLORS.accent, fontWeight: '700' },
  countryCheck: { fontSize: 16, color: COLORS.accent, fontWeight: '700' },
  addressInputCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  addressDotsCol: { width: 16, alignItems: 'center' },
  addressGreenDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#10b981' },
  addressInput: { flex: 1, fontSize: 15, color: COLORS.textPrimary, paddingVertical: 12 },
  addressPredictions: {
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopWidth: 0,
    borderBottomLeftRadius: BORDER_RADIUS.md,
    borderBottomRightRadius: BORDER_RADIUS.md,
    maxHeight: 200,
  },
  addressPredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.grayLight,
    gap: SPACING.sm,
  },
  addressPredPin: { fontSize: 14 },
  addressPredMain: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  addressPredSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 1 },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    paddingVertical: SPACING.sm,
  },
  uploadingText: {
    fontSize: 13,
    color: COLORS.accent,
    fontWeight: '600',
  },
  libraryModal: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  libraryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  libraryClose: {
    fontSize: 20,
    color: COLORS.textPrimary,
    padding: 4,
  },
  libraryTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  libraryDone: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.accent,
  },
  libraryFilterRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.xs,
    backgroundColor: COLORS.white,
  },
  libraryFilterChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: BORDER_RADIUS.full,
    backgroundColor: COLORS.grayLight,
  },
  libraryFilterActive: {
    backgroundColor: COLORS.primary,
  },
  libraryFilterText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  libraryFilterTextActive: {
    color: COLORS.accent,
    fontWeight: '600',
  },
  libraryGrid: {
    padding: SPACING.xs,
  },
  libraryImageItem: {
    flex: 1 / 3,
    margin: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    overflow: 'hidden',
    backgroundColor: COLORS.white,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  libraryImageSelected: {
    borderColor: COLORS.accent,
  },
  libraryImageThumb: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: COLORS.grayLight,
  },
  libraryCheckmark: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  libraryCheckmarkText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 14,
  },
  libraryImageLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: 2,
  },
  libraryEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.xl,
  },
  libraryEmptyIcon: {
    fontSize: 48,
  },
  libraryEmptyText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  libraryEmptySubtext: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.white,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.md,
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomBarInner: {
    flexDirection: 'row',
    gap: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  prevButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  prevButtonText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  nextButton: {
    flex: 2,
    backgroundColor: COLORS.accent,
    borderRadius: BORDER_RADIUS.md,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  nextButtonFull: {
    flex: 1,
  },
  disabledButton: {
    opacity: 0.7,
  },
  nextButtonText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 16,
  },
}); }
