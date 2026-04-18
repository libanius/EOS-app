/**
 * EOS — Mobile entry point
 *
 * Bootstraps:
 *   1. ConnectivityService polling (CA-03)
 *   2. Model load if already downloaded
 *   3. Navigation stack (ModelSetup → Scenario)
 *   4. ModeIndicator in the header
 */

import React, { useEffect, useState } from 'react'
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { ModeIndicator } from './components/ModeIndicator'
import { ModelSetupScreen } from './screens/ModelSetupScreen'
import { ScenarioScreen } from './screens/ScenarioScreen'
import { LoRaMeshScreen } from './screens/LoRaMeshScreen'
import { startConnectivityService } from './services/ConnectivityService'
import {
  recommendModel,
  modelManager,
} from './eos-intelligence-layer'
import { useEOSStore } from './store'

const Stack = createNativeStackNavigator()

export default function App() {
  const [booted, setBooted] = useState(false)
  const setModelReady = useEOSStore((s) => s.setModelReady)

  useEffect(() => {
    ;(async () => {
      startConnectivityService()
      const spec = await recommendModel()
      if (await modelManager.isDownloaded(spec)) {
        try {
          await modelManager.load(spec)
          setModelReady(true, spec)
        } catch {
          setModelReady(false, null)
        }
      }
      setBooted(true)
    })()
  }, [setModelReady])

  if (!booted) {
    return <SafeAreaView style={styles.root} />
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
      <View style={styles.header}>
        <ModeIndicator />
      </View>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{ headerShown: false }}
          initialRouteName="ModelSetup"
        >
          <Stack.Screen name="ModelSetup">
            {({ navigation }) => (
              <ModelSetupScreen
                onReady={() => navigation.replace('Scenario')}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Scenario" component={ScenarioScreen} />
          <Stack.Screen name="LoRaMesh" component={LoRaMeshScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0f' },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderBottomColor: '#1a1a24',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})
